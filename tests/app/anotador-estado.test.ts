import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores, lances, peladas } from '@/db/schema';
import type { TipoLance } from '@/domain/partida';
import { dataDe } from '@/domain/tempo';
import { Anotacoes, derivar, tempoNaTela, type Escritor } from '@/app/admin/(area)/partida/[id]/anotador-estado';
import { lerEstado, type EstadoDaPartida } from '@/app/admin/(area)/partida/[id]/estado';
import { desfazerUltimo, iniciarPartida, registrarLance } from '@/server/partidas';
import { salvarTimesDefinitivos, timesDaPelada } from '@/server/times';
import { createTestDb } from '../helpers/db';

// O estado otimista do anotador contra o servidor de verdade (PGlite): a fila de escritas, a
// conta que a tela mostra e o alvo do Desfazer.

let db: DB;
let partidaId: number;
let pepe: number, rafa: number, biel: number;

beforeEach(async () => {
  db = await createTestDb();
  const nomes = ['Pepe', 'Rafa', 'Biel', 'Duda'];
  const ids: number[] = [];
  for (const nome of nomes) ids.push((await db.insert(jogadores).values({ nome }).returning({ id: jogadores.id }))[0].id);
  [pepe, rafa, biel] = ids;
  const [p] = await db.insert(peladas).values({ data: dataDe(new Date()) }).returning({ id: peladas.id });
  await salvarTimesDefinitivos(db, p.id, [
    [ids[0], ids[1]],
    [ids[2], ids[3]],
  ]);
  const [azul, laranja] = (await timesDaPelada(db, p.id)).map((t) => t.id);
  partidaId = await iniciarPartida(db, p.id, azul, laranja, new Date());
});

const estado = async () => (await lerEstado(db, partidaId))!;
const lancesNoBanco = async () =>
  (await db.select().from(lances).where(eq(lances.partidaId, partidaId)).orderBy(asc(lances.id))).map((l) => ({
    jogadorId: l.jogadorId,
    tipo: l.tipo,
  }));

/** Escritor ligado direto às funções do servidor, como as ações da tela (sem sessão). */
function escritorReal(): Escritor {
  return {
    async anotar(jogadorId: number, tipo: TipoLance) {
      const lanceId = await registrarLance(db, partidaId, jogadorId, tipo);
      return { ok: true, estado: await estado(), lanceId };
    },
    async desfazer(esperadoId: number) {
      await desfazerUltimo(db, partidaId, esperadoId);
      return { ok: true, estado: await estado() };
    },
  };
}

/** Promessa que só resolve quando o teste mandar (para segurar a resposta de um toque). */
function portao() {
  let abrir!: () => void;
  const aberto = new Promise<void>((r) => (abrir = r));
  return { aberto, abrir };
}

const gols = (a: Anotacoes, id: number) => a.instantaneo().conta(id, 'gol');

describe('fila de escritas (T12-1)', () => {
  it('toque errado → Desfazer → toque certo, tudo antes da resposta: no servidor fica só o gol certo', async () => {
    const a = new Anotacoes(await estado(), escritorReal());
    a.tocar(pepe, 'gol'); // errado
    a.desfazer();
    a.tocar(rafa, 'gol'); // certo
    // Na tela, na hora: 1×0 com o gol do Rafa.
    expect(a.instantaneo().placar).toEqual({ A: 1, B: 0 });
    expect(gols(a, pepe)).toBe(0);
    expect(gols(a, rafa)).toBe(1);
    expect(a.instantaneo().alvo).toMatchObject({ jogadorId: rafa, tipo: 'gol' });

    await a.ocioso();
    expect(await lancesNoBanco()).toEqual([{ jogadorId: rafa, tipo: 'gol' }]);
    expect(a.instantaneo().placar).toEqual({ A: 1, B: 0 });
    expect(a.instantaneo().aviso).toBeNull();
  });

  it('desfazer um toque ainda em voo: some da conta na hora e não chega a ficar no servidor', async () => {
    const a = new Anotacoes(await estado(), escritorReal());
    a.tocar(biel, 'gol');
    expect(a.instantaneo().placar).toEqual({ A: 0, B: 1 });
    a.desfazer();
    expect(a.instantaneo().placar).toEqual({ A: 0, B: 0 });
    expect(a.instantaneo().desfazendo).toBe(true);
    await a.ocioso();
    expect(await lancesNoBanco()).toEqual([]);
    expect(a.instantaneo().desfazendo).toBe(false);
  });

  it('dois Desfazer seguidos: o segundo entra na fila e tira o lance anterior ao primeiro', async () => {
    await registrarLance(db, partidaId, pepe, 'gol');
    await registrarLance(db, partidaId, rafa, 'assistencia');
    await registrarLance(db, partidaId, biel, 'gol');
    const a = new Anotacoes(await estado(), escritorReal());
    expect(a.desfazer()).toBe(true);
    // O rótulo já mostra o próximo e o botão continua valendo.
    expect(a.instantaneo().alvo).toMatchObject({ jogadorId: rafa, tipo: 'assistencia' });
    expect(a.desfazer()).toBe(true);
    expect(a.instantaneo().alvo).toMatchObject({ jogadorId: pepe, tipo: 'gol' });
    expect(a.instantaneo().placar).toEqual({ A: 1, B: 0 });
    await a.ocioso();
    expect(await lancesNoBanco()).toEqual([{ jogadorId: pepe, tipo: 'gol' }]);
  });

  it('Desfazer sem nada para desfazer não enfileira nada', async () => {
    const a = new Anotacoes(await estado(), escritorReal());
    expect(a.desfazer()).toBe(false);
    expect(a.instantaneo().desfazendo).toBe(false);
  });

  it('Desfazer que o outro admin atropelou (lance novo dele depois): não desfaz o lance dele e avisa', async () => {
    await registrarLance(db, partidaId, pepe, 'gol');
    const a = new Anotacoes(await estado(), escritorReal()); // a tela mostra o gol do Pepe como último
    await registrarLance(db, partidaId, biel, 'gol'); // o outro admin anota, a tela ainda não viu
    a.desfazer();
    await a.ocioso();
    expect(await lancesNoBanco()).toEqual([
      { jogadorId: pepe, tipo: 'gol' },
      { jogadorId: biel, tipo: 'gol' },
    ]);
    expect(a.instantaneo().placar).toEqual({ A: 1, B: 1 });
    expect(a.instantaneo().aviso).toMatchObject({ tipo: 'erro' });
  });

  it('servidor recusa o toque: o número volta, os Desfazer daquele toque caem e o erro aparece', async () => {
    const real = escritorReal();
    const a = new Anotacoes(await estado(), {
      ...real,
      anotar: async () => ({ ok: false, erro: 'Essa partida já foi encerrada.' }),
    });
    a.tocar(pepe, 'gol');
    expect(gols(a, pepe)).toBe(1);
    await a.ocioso();
    expect(gols(a, pepe)).toBe(0);
    expect(a.instantaneo().placar).toEqual({ A: 0, B: 0 });
    expect(a.instantaneo().aviso).toMatchObject({ tipo: 'erro', texto: 'Essa partida já foi encerrada.' });
  });

  it('erro de rede (a ação lança) conta como falha, sem travar a fila', async () => {
    const real = escritorReal();
    let primeira = true;
    const a = new Anotacoes(await estado(), {
      ...real,
      anotar: async (j, t) => {
        if (primeira) {
          primeira = false;
          throw new Error('rede caiu');
        }
        return real.anotar(j, t);
      },
    });
    a.tocar(pepe, 'gol');
    a.tocar(rafa, 'gol');
    await a.ocioso();
    expect(await lancesNoBanco()).toEqual([{ jogadorId: rafa, tipo: 'gol' }]);
    expect(a.instantaneo().placar).toEqual({ A: 1, B: 0 });
    expect(a.instantaneo().aviso).toMatchObject({ tipo: 'erro' });
  });
});

describe('a página recarregada (a cada 5 s) e a fila', () => {
  it('recarga que chega durante um toque, já com o lance gravado, não conta o toque duas vezes', async () => {
    const real = escritorReal();
    const segura = portao();
    let gravou!: () => void;
    const gravado = new Promise<void>((r) => (gravou = r));
    const a = new Anotacoes(await estado(), {
      ...real,
      anotar: async (j, t) => {
        const lanceId = await registrarLance(db, partidaId, j, t);
        gravou();
        await segura.aberto;
        return { ok: true, estado: await estado(), lanceId };
      },
    });
    a.tocar(pepe, 'gol');
    await gravado;
    a.receberDaPagina(await estado()); // leitura nova, que já tem o gol
    expect(gols(a, pepe)).toBe(1);
    expect(a.instantaneo().placar).toEqual({ A: 1, B: 0 });
    segura.abrir();
    await a.ocioso();
    expect(gols(a, pepe)).toBe(1);
  });

  it('sem escrita pendente, a leitura mais nova da página entra (outro admin anotou)', async () => {
    const a = new Anotacoes(await estado(), escritorReal());
    await registrarLance(db, partidaId, biel, 'gol');
    const nova: EstadoDaPartida = { ...(await estado()), lidoEm: Date.now() + 1000 };
    a.receberDaPagina(nova);
    expect(a.instantaneo().placar).toEqual({ A: 0, B: 1 });
    // Uma leitura mais velha não volta atrás.
    a.receberDaPagina({ ...nova, lances: [], lidoEm: nova.lidoEm - 5000 });
    expect(a.instantaneo().placar).toEqual({ A: 0, B: 1 });
  });

  it('a leitura da página que chega durante a fila fica de fora; no fim vale a resposta, que é mais nova', async () => {
    const real = escritorReal();
    const segura = portao();
    const a = new Anotacoes(await estado(), {
      ...real,
      anotar: async (j, t) => {
        await segura.aberto;
        return real.anotar(j, t);
      },
    });
    a.tocar(pepe, 'gol');
    await registrarLance(db, partidaId, biel, 'gol'); // outro admin
    a.receberDaPagina(await estado()); // tem o gol do Biel, mas ainda não o do Pepe
    expect(a.instantaneo().placar).toEqual({ A: 1, B: 0 }); // a última resposta + o toque pendente
    segura.abrir();
    await a.ocioso();
    expect(a.instantaneo().placar).toEqual({ A: 1, B: 1 });
  });
});

describe('derivar', () => {
  it('soma os toques pendentes, tira os desfeitos e aponta o alvo do Desfazer', async () => {
    const l = await registrarLance(db, partidaId, pepe, 'assistencia');
    const base = await estado();
    const v = derivar(base, [
      { tipo: 'toque', chave: 1, jogadorId: rafa, lance: 'gol' },
      { tipo: 'toque', chave: 2, jogadorId: biel, lance: 'gol' },
      { tipo: 'desfazer', chave: 3, alvo: { toque: 2 } },
    ]);
    expect(v.placar).toEqual({ A: 1, B: 0 });
    expect(v.conta(rafa, 'gol')).toBe(1);
    expect(v.conta(biel, 'gol')).toBe(0);
    expect(v.conta(pepe, 'assistencia')).toBe(1);
    expect(v.alvo).toMatchObject({ jogadorId: rafa, tipo: 'gol' });
    expect([...v.salvando]).toEqual([rafa]);
    expect(v.desfazendo).toBe(true);

    const so = derivar(base, [{ tipo: 'desfazer', chave: 4, alvo: { lanceId: l } }]);
    expect(so.conta(pepe, 'assistencia')).toBe(0);
    expect(so.alvo).toBeNull();
  });
});

describe('tempoNaTela', () => {
  it('em andamento conta pelo relógio; encerrada fica parada no que faltava ao encerrar (P5-c)', async () => {
    const e = await estado();
    expect(tempoNaTela(e, null)).toBe(e.tempoRestanteMs);
    expect(tempoNaTela(e, e.iniciadaEm + 60_000)).toBe(7 * 60_000);
    const encerrada = { ...e, encerrada: true, tempoRestanteMs: 3 * 60_000 };
    expect(tempoNaTela(encerrada, e.iniciadaEm + 60 * 60_000)).toBe(3 * 60_000);
  });
});
