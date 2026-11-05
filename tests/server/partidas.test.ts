import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores, lances, partidaJogadores, partidas, peladas } from '@/db/schema';
import { DURACAO_MS } from '@/domain/partida';
import {
  corrigirContagem,
  corrigirPartida,
  desfazerUltimo,
  encerrarPartida,
  ErroPartida,
  filaDeTimes,
  historicoDaPelada,
  iniciarPartida,
  partidaAoVivo,
  partidaEmAndamento,
  partidasAbertasDeOutrasPeladas,
  registrarLance,
} from '@/server/partidas';
import { definirEstadoManual, ErroLista } from '@/server/pelada';
import { moverJogador, salvarTimesDefinitivos, timesDaPelada } from '@/server/times';
import { createTestDb } from '../helpers/db';

const HOJE = '2026-11-11';
const NOITE = new Date('2026-11-11T20:40:00-03:00');
const depois = (ms: number) => new Date(NOITE.getTime() + ms);
const MIN = 60_000;

let db: DB;

async function criar(nomes: string[]): Promise<number[]> {
  const ids: number[] = [];
  for (const nome of nomes) {
    const [j] = await db.insert(jogadores).values({ nome }).returning({ id: jogadores.id });
    ids.push(j.id);
  }
  return ids;
}

async function novaPelada(data: string): Promise<number> {
  const [p] = await db.insert(peladas).values({ data }).returning({ id: peladas.id });
  return p.id;
}

/** Pelada de hoje com 4 times de 2: azul [a1, a2], laranja [l1, l2], verde [v1, v2], preto [p1, p2]. */
async function cenario() {
  const peladaId = await novaPelada(HOJE);
  const [a1, a2, l1, l2, v1, v2, p1, p2] = await criar(['Ana', 'Bia', 'Caio', 'Davi', 'Edu', 'Fábio', 'Gil', 'Hugo']);
  await salvarTimesDefinitivos(db, peladaId, [
    [a1, a2],
    [l1, l2],
    [v1, v2],
    [p1, p2],
  ]);
  const [azul, laranja, verde, preto] = (await timesDaPelada(db, peladaId)).map((t) => t.id);
  return { peladaId, azul, laranja, verde, preto, a1, a2, l1, l2, v1, v2, p1, p2 };
}

const motivo = (p: Promise<unknown>) => p.then(() => undefined, (e: ErroPartida) => e.motivo);

async function placarDe(partidaId: number) {
  return (await partidaAoVivo(db, partidaId, NOITE))!.placar;
}

beforeEach(async () => {
  db = await createTestDb();
});

describe('iniciarPartida', () => {
  it('grava a partida com a hora de início e a foto do elenco por lado', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);

    const [p] = await db.select().from(partidas).where(eq(partidas.id, id));
    expect(p).toMatchObject({ peladaId: c.peladaId, timeAId: c.azul, timeBId: c.laranja, encerradaEm: null, resultado: null });
    expect(p.iniciadaEm.getTime()).toBe(NOITE.getTime());
    const elenco = await db
      .select({ jogadorId: partidaJogadores.jogadorId, lado: partidaJogadores.lado })
      .from(partidaJogadores)
      .where(eq(partidaJogadores.partidaId, id))
      .orderBy(asc(partidaJogadores.jogadorId));
    expect(elenco).toEqual([
      { jogadorId: c.a1, lado: 'A' },
      { jogadorId: c.a2, lado: 'A' },
      { jogadorId: c.l1, lado: 'B' },
      { jogadorId: c.l2, lado: 'B' },
    ]);
  });

  it('a foto só leva jogadores ativos', async () => {
    const c = await cenario();
    await db.update(jogadores).set({ ativo: false }).where(eq(jogadores.id, c.a2));
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    const ids = (await db.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, id))).map((j) => j.jogadorId);
    expect(ids.sort()).toEqual([c.a1, c.l1, c.l2].sort());
  });

  it('mexer no time depois não muda a foto da partida (Review Focus 4)', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    await registrarLance(db, id, c.a2, 'gol');
    const antes = await db.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, id));

    await moverJogador(db, c.a2, c.azul, null); // sai do Azul
    await moverJogador(db, c.l1, c.laranja, c.azul); // vai pro Azul

    const agora = await db.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, id));
    expect(agora).toEqual(antes);
    expect(await placarDe(id)).toEqual({ A: 1, B: 0 });
    // A próxima partida já usa os times novos.
    await encerrarPartida(db, id, depois(8 * MIN));
    const nova = await iniciarPartida(db, c.peladaId, c.azul, c.verde, depois(9 * MIN));
    const ladoA = (await partidaAoVivo(db, nova, depois(9 * MIN)))!.lados.A.jogadores.map((j) => j.id);
    expect(ladoA.sort()).toEqual([c.a1, c.l1].sort());
  });

  it('recusa uma segunda partida com outra em andamento; depois de encerrar, pode', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    const erro = await iniciarPartida(db, c.peladaId, c.verde, c.preto, NOITE).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroPartida);
    expect(erro.motivo).toBe('partida_em_andamento');

    await encerrarPartida(db, id, depois(8 * MIN));
    expect(await iniciarPartida(db, c.peladaId, c.verde, c.preto, depois(9 * MIN))).toBeGreaterThan(id);
  });

  it('duas partidas iniciadas ao mesmo tempo: só uma entra', async () => {
    const c = await cenario();
    const r = await Promise.allSettled([
      iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE),
      iniciarPartida(db, c.peladaId, c.verde, c.preto, NOITE),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(r.find((x) => x.status === 'rejected')).toMatchObject({ reason: { motivo: 'partida_em_andamento' } });
    expect(await db.select().from(partidas)).toHaveLength(1);
  });

  it('recusa o mesmo time dos dois lados, time vazio, time de outra pelada e pelada que não é de hoje', async () => {
    const c = await cenario();
    expect(await motivo(iniciarPartida(db, c.peladaId, c.azul, c.azul, NOITE))).toBe('mesmo_time');

    await db.update(jogadores).set({ ativo: false }).where(eq(jogadores.id, c.p1));
    await moverJogador(db, c.p2, c.preto, null);
    expect(await motivo(iniciarPartida(db, c.peladaId, c.azul, c.preto, NOITE))).toBe('time_vazio');

    const outra = await novaPelada('2026-11-04');
    const [x] = await criar(['Xavier']);
    await salvarTimesDefinitivos(db, outra, [[x]]);
    const [timeDaOutra] = await timesDaPelada(db, outra);
    expect(await motivo(iniciarPartida(db, c.peladaId, c.azul, timeDaOutra.id, NOITE))).toBe('time_inexistente');
    expect(await motivo(iniciarPartida(db, c.peladaId, c.azul, 999_999, NOITE))).toBe('time_inexistente');

    const quinta = new Date('2026-11-12T20:40:00-03:00');
    expect(await motivo(iniciarPartida(db, c.peladaId, c.azul, c.laranja, quinta))).toBe('pelada_nao_e_hoje');
    expect(await motivo(iniciarPartida(db, 999_999, c.azul, c.laranja, NOITE))).toBe('pelada_inexistente');
    expect(await db.select().from(partidas)).toHaveLength(0);
  });

  it('time só com jogador desativado conta como vazio', async () => {
    const c = await cenario();
    await db.update(jogadores).set({ ativo: false }).where(eq(jogadores.id, c.l1));
    await db.update(jogadores).set({ ativo: false }).where(eq(jogadores.id, c.l2));
    expect(await motivo(iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE))).toBe('time_vazio');
  });

  it('recusa iniciar com a pelada cancelada (T11-b)', async () => {
    const c = await cenario();
    await db.update(peladas).set({ estadoManual: 'cancelada' }).where(eq(peladas.id, c.peladaId));
    expect(await motivo(iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE))).toBe('pelada_cancelada');
    expect(await db.select().from(partidas)).toHaveLength(0);

    await db.update(peladas).set({ estadoManual: 'fechada' }).where(eq(peladas.id, c.peladaId));
    expect(await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE)).toBeGreaterThan(0);
  });
});

describe('registrarLance e desfazerUltimo', () => {
  it('dois gols seguidos = dois lances; desfazer tira só o último (Review Focus 2)', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    await registrarLance(db, id, c.a1, 'gol');
    await registrarLance(db, id, c.a1, 'gol');
    expect(await placarDe(id)).toEqual({ A: 2, B: 0 });

    await desfazerUltimo(db, id);
    expect(await placarDe(id)).toEqual({ A: 1, B: 0 });
    expect(await db.select().from(lances)).toHaveLength(1);
  });

  it('desfazer várias vezes seguidas vai tirando do último para o primeiro; sem lances, nada', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    const gol = await registrarLance(db, id, c.a1, 'gol');
    await registrarLance(db, id, c.l1, 'gol');
    await registrarLance(db, id, c.a2, 'assistencia');

    await desfazerUltimo(db, id);
    await desfazerUltimo(db, id);
    expect((await db.select().from(lances)).map((l) => l.id)).toEqual([gol]);
    await desfazerUltimo(db, id);
    await desfazerUltimo(db, id); // já vazia: não faz nada
    expect(await db.select().from(lances)).toHaveLength(0);
  });

  it('dois admins desfazendo ao mesmo tempo: cada um tira um lance, do último para trás', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    const primeiro = await registrarLance(db, id, c.a1, 'gol');
    await registrarLance(db, id, c.a2, 'gol');
    await registrarLance(db, id, c.l1, 'gol');
    await Promise.all([desfazerUltimo(db, id), desfazerUltimo(db, id)]);
    expect((await db.select().from(lances)).map((l) => l.id)).toEqual([primeiro]);
  });

  it('devolve o id do lance desfeito, ou null quando não tinha lance', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    const gol = await registrarLance(db, id, c.a1, 'gol');
    expect(await desfazerUltimo(db, id)).toBe(gol);
    expect(await desfazerUltimo(db, id)).toBeNull();
  });

  it('com o id esperado: só desfaz se ele ainda for o último (dois admins no mesmo Desfazer, T11-b)', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    const primeiro = await registrarLance(db, id, c.a1, 'gol');
    const segundo = await registrarLance(db, id, c.a2, 'gol');

    // Os dois admins viam o mesmo último lance e tocaram Desfazer: sai um lance só.
    const [r1, r2] = await Promise.all([desfazerUltimo(db, id, segundo), desfazerUltimo(db, id, segundo)]);
    expect([r1, r2].sort()).toEqual([null, segundo].sort());
    expect((await db.select().from(lances)).map((l) => l.id)).toEqual([primeiro]);

    // Um lance novo entrou depois do que a tela mostrava: não desfaz o lance novo.
    const novo = await registrarLance(db, id, c.l1, 'gol');
    expect(await desfazerUltimo(db, id, primeiro)).toBeNull();
    expect((await db.select().from(lances)).map((l) => l.id)).toEqual([primeiro, novo]);

    // O esperado é o último: desfaz.
    expect(await desfazerUltimo(db, id, novo)).toBe(novo);
    // Sem lances, com esperado: nada.
    await desfazerUltimo(db, id);
    expect(await desfazerUltimo(db, id, primeiro)).toBeNull();
  });

  it('dois admins anotando ao mesmo tempo: os dois lances ficam', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    await Promise.all([registrarLance(db, id, c.a1, 'gol'), registrarLance(db, id, c.l1, 'gol')]);
    expect(await placarDe(id)).toEqual({ A: 1, B: 1 });
  });

  it('desfazer só mexe na partida pedida, mesmo que outra tenha lance mais novo', async () => {
    const c = await cenario();
    const p1 = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    await encerrarPartida(db, p1, depois(8 * MIN));
    const p2 = await iniciarPartida(db, c.peladaId, c.verde, c.preto, depois(9 * MIN));
    const golP2 = await registrarLance(db, p2, c.v1, 'gol');
    await corrigirPartida(db, p1, { adicionar: [{ jogadorId: c.a1, tipo: 'gol' }] }); // id maior, na p1

    await desfazerUltimo(db, p2);
    const restantes = await db.select().from(lances);
    expect(restantes.map((l) => l.partidaId)).toEqual([p1]);
    expect(restantes.map((l) => l.id)).not.toContain(golP2);
  });

  it('assistência fica registrada mas não muda o placar', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    await registrarLance(db, id, c.a2, 'assistencia');
    await registrarLance(db, id, c.a1, 'gol');
    expect(await placarDe(id)).toEqual({ A: 1, B: 0 });
    expect(await db.select().from(lances)).toHaveLength(2);
  });

  it('recusa jogador fora da partida (mesmo que esteja no time agora) e partida encerrada', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    expect(await motivo(registrarLance(db, id, c.v1, 'gol'))).toBe('fora_da_partida');
    await moverJogador(db, c.v1, c.verde, c.azul);
    expect(await motivo(registrarLance(db, id, c.v1, 'gol'))).toBe('fora_da_partida');

    await encerrarPartida(db, id, depois(8 * MIN));
    const erro = await registrarLance(db, id, c.a1, 'gol').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroPartida);
    expect(erro.motivo).toBe('ja_encerrada');
    expect(await motivo(desfazerUltimo(db, id))).toBe('ja_encerrada');
    expect(await motivo(registrarLance(db, 999_999, c.a1, 'gol'))).toBe('partida_inexistente');
    expect(await db.select().from(lances)).toHaveLength(0);
  });
});

describe('encerrarPartida', () => {
  it('1 × 1 grava empate e a hora do encerramento', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    await registrarLance(db, id, c.a1, 'gol');
    await registrarLance(db, id, c.l2, 'gol');
    expect(await encerrarPartida(db, id, depois(8 * MIN))).toBe('empate');

    const [p] = await db.select().from(partidas).where(eq(partidas.id, id));
    expect(p.resultado).toBe('empate');
    expect(p.encerradaEm?.getTime()).toBe(depois(8 * MIN).getTime());
  });

  it('vitória do lado com mais gols; 0 × 0 é empate', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    await registrarLance(db, id, c.l1, 'gol');
    await registrarLance(db, id, c.a1, 'assistencia');
    expect(await encerrarPartida(db, id, depois(3 * MIN))).toBe('B');

    const outra = await iniciarPartida(db, c.peladaId, c.verde, c.preto, depois(4 * MIN));
    expect(await encerrarPartida(db, outra, depois(12 * MIN))).toBe('empate');
  });

  it('encerrar de novo: ja_encerrada, sem mudar nada', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    await encerrarPartida(db, id, depois(8 * MIN));
    expect(await motivo(encerrarPartida(db, id, depois(10 * MIN)))).toBe('ja_encerrada');
    const [p] = await db.select().from(partidas).where(eq(partidas.id, id));
    expect(p.encerradaEm?.getTime()).toBe(depois(8 * MIN).getTime());
    expect(await motivo(encerrarPartida(db, 999_999, NOITE))).toBe('partida_inexistente');
  });
});

describe('corrigirPartida', () => {
  it('adiciona e remove lances e recalcula o resultado', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    const golErrado = await registrarLance(db, id, c.a1, 'gol');
    expect(await encerrarPartida(db, id, depois(8 * MIN))).toBe('A');

    expect(
      await corrigirPartida(db, id, {
        removerLanceIds: [golErrado],
        adicionar: [
          { jogadorId: c.l1, tipo: 'gol' },
          { jogadorId: c.l2, tipo: 'assistencia' },
        ],
      }),
    ).toBe('B');
    const [p] = await db.select().from(partidas).where(eq(partidas.id, id));
    expect(p.resultado).toBe('B');
    expect(p.encerradaEm?.getTime()).toBe(depois(8 * MIN).getTime());
    expect(await placarDe(id)).toEqual({ A: 0, B: 1 });
    expect(await db.select().from(lances)).toHaveLength(2);
  });

  it('só em partida encerrada, com jogadores e lances da própria partida', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    expect(await motivo(corrigirPartida(db, id, { adicionar: [{ jogadorId: c.a1, tipo: 'gol' }] }))).toBe('nao_encerrada');
    await encerrarPartida(db, id, depois(8 * MIN));

    const outra = await iniciarPartida(db, c.peladaId, c.verde, c.preto, depois(9 * MIN));
    const golDaOutra = await registrarLance(db, outra, c.v1, 'gol');
    expect(await motivo(corrigirPartida(db, id, { adicionar: [{ jogadorId: c.v1, tipo: 'gol' }] }))).toBe('fora_da_partida');
    expect(await motivo(corrigirPartida(db, id, { removerLanceIds: [golDaOutra] }))).toBe('lance_inexistente');
    expect(await motivo(corrigirPartida(db, 999_999, {}))).toBe('partida_inexistente');
    // Nada foi gravado pela metade.
    expect((await db.select().from(lances)).map((l) => l.id)).toEqual([golDaOutra]);
  });
});

describe('corrigirContagem', () => {
  it('+1 põe um lance do jogador; −1 tira o mais recente dele daquele tipo; o resultado acompanha', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    const golAntigo = await registrarLance(db, id, c.a1, 'gol');
    const assist = await registrarLance(db, id, c.a1, 'assistencia');
    const golNovo = await registrarLance(db, id, c.a1, 'gol');
    await encerrarPartida(db, id, depois(8 * MIN));

    expect(await corrigirContagem(db, id, c.a1, 'gol', -1)).toBe('A');
    expect((await db.select().from(lances).orderBy(asc(lances.id))).map((l) => l.id)).toEqual([golAntigo, assist]);
    expect(golNovo).toBeGreaterThan(golAntigo);

    expect(await corrigirContagem(db, id, c.l1, 'gol', 1)).toBe('empate');
    expect(await corrigirContagem(db, id, c.l2, 'gol', 1)).toBe('B');
    const [p] = await db.select().from(partidas).where(eq(partidas.id, id));
    expect(p.resultado).toBe('B');
    expect(await placarDe(id)).toEqual({ A: 1, B: 2 });
  });

  it('recusa −1 sem lance daquele tipo, jogador fora da partida e partida não encerrada', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    await registrarLance(db, id, c.a1, 'assistencia');
    expect(await motivo(corrigirContagem(db, id, c.a1, 'gol', 1))).toBe('nao_encerrada');
    await encerrarPartida(db, id, depois(8 * MIN));

    expect(await motivo(corrigirContagem(db, id, c.a1, 'gol', -1))).toBe('lance_inexistente');
    expect(await motivo(corrigirContagem(db, id, c.v1, 'gol', 1))).toBe('fora_da_partida');
    expect(await motivo(corrigirContagem(db, 999_999, c.a1, 'gol', 1))).toBe('partida_inexistente');
    expect(await db.select().from(lances)).toHaveLength(1);
  });
});

describe('partidaAoVivo', () => {
  it('traz placar, lados com cores e números de cada jogador, cronômetro e os lances em ordem', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    const l1 = await registrarLance(db, id, c.a1, 'gol');
    const l2 = await registrarLance(db, id, c.a2, 'assistencia');
    const l3 = await registrarLance(db, id, c.a1, 'gol');
    const l4 = await registrarLance(db, id, c.l1, 'gol');

    const v = await partidaAoVivo(db, id, depois(3 * MIN));
    expect(v).toEqual({
      id,
      peladaId: c.peladaId,
      iniciadaEm: NOITE,
      encerrada: false,
      resultado: null,
      placar: { A: 2, B: 1 },
      tempoRestanteMs: 5 * MIN,
      sugerirEncerrar: null,
      lances: [
        { id: l1, jogadorId: c.a1, tipo: 'gol' },
        { id: l2, jogadorId: c.a2, tipo: 'assistencia' },
        { id: l3, jogadorId: c.a1, tipo: 'gol' },
        { id: l4, jogadorId: c.l1, tipo: 'gol' },
      ],
      lados: {
        A: {
          timeId: c.azul,
          cor: 'azul',
          jogadores: [
            { id: c.a1, nome: 'Ana', gols: 2, assistencias: 0 },
            { id: c.a2, nome: 'Bia', gols: 0, assistencias: 1 },
          ],
        },
        B: {
          timeId: c.laranja,
          cor: 'laranja',
          jogadores: [
            { id: c.l1, nome: 'Caio', gols: 1, assistencias: 0 },
            { id: c.l2, nome: 'Davi', gols: 0, assistencias: 0 },
          ],
        },
      },
    });
  });

  it('sugere encerrar no 3º gol e quando o tempo acaba', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    expect((await partidaAoVivo(db, id, depois(8 * MIN)))!).toMatchObject({ sugerirEncerrar: 'tempo', tempoRestanteMs: 0 });
    for (let i = 0; i < 3; i++) await registrarLance(db, id, c.l2, 'gol');
    expect((await partidaAoVivo(db, id, depois(MIN)))!.sugerirEncerrar).toBe('tres_gols');
  });

  it('partida encerrada: resultado, cronômetro parado na hora do encerramento e sem sugestão', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    for (let i = 0; i < 3; i++) await registrarLance(db, id, c.a1, 'gol');
    await encerrarPartida(db, id, depois(5 * MIN));
    expect(await partidaAoVivo(db, id, depois(60 * MIN))).toMatchObject({
      encerrada: true,
      resultado: 'A',
      placar: { A: 3, B: 0 },
      tempoRestanteMs: DURACAO_MS - 5 * MIN,
      sugerirEncerrar: null,
    });
  });

  it('sem lances: lista vazia; partida que não existe: null', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    expect((await partidaAoVivo(db, id, NOITE))!.lances).toEqual([]);
    expect(await partidaAoVivo(db, 999_999, NOITE)).toBeNull();
  });
});

describe('noite: partidaEmAndamento, historicoDaPelada e filaDeTimes', () => {
  it('partidaEmAndamento: o id da que está rolando, ou null', async () => {
    const c = await cenario();
    expect(await partidaEmAndamento(db, c.peladaId)).toBeNull();
    const id = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    expect(await partidaEmAndamento(db, c.peladaId)).toBe(id);
    await encerrarPartida(db, id, depois(8 * MIN));
    expect(await partidaEmAndamento(db, c.peladaId)).toBeNull();
  });

  it('historicoDaPelada: só as encerradas, na ordem, com placar, cores e resultado', async () => {
    const c = await cenario();
    const p1 = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    await registrarLance(db, p1, c.a1, 'gol');
    await encerrarPartida(db, p1, depois(8 * MIN));
    const p2 = await iniciarPartida(db, c.peladaId, c.azul, c.verde, depois(9 * MIN));
    await registrarLance(db, p2, c.v1, 'gol');
    await registrarLance(db, p2, c.a2, 'gol');
    await encerrarPartida(db, p2, depois(17 * MIN));
    await iniciarPartida(db, c.peladaId, c.verde, c.preto, depois(18 * MIN)); // em andamento

    expect(await historicoDaPelada(db, c.peladaId)).toEqual([
      {
        id: p1,
        timeA: { id: c.azul, cor: 'azul' },
        timeB: { id: c.laranja, cor: 'laranja' },
        placar: { A: 1, B: 0 },
        resultado: 'A',
        iniciadaEm: NOITE,
        encerradaEm: depois(8 * MIN),
      },
      {
        id: p2,
        timeA: { id: c.azul, cor: 'azul' },
        timeB: { id: c.verde, cor: 'verde' },
        placar: { A: 1, B: 1 },
        resultado: 'empate',
        iniciadaEm: depois(9 * MIN),
        encerradaEm: depois(17 * MIN),
      },
    ]);
  });

  it('filaDeTimes: começa na ordem dos times e segue quem perde sai, empate saem os dois', async () => {
    const c = await cenario();
    expect(await filaDeTimes(db, c.peladaId)).toEqual([c.azul, c.laranja, c.verde, c.preto]);

    const p1 = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);
    await registrarLance(db, p1, c.l1, 'gol');
    await encerrarPartida(db, p1, depois(8 * MIN)); // Laranja vence: fica
    expect(await filaDeTimes(db, c.peladaId)).toEqual([c.laranja, c.verde, c.preto, c.azul]);

    const p2 = await iniciarPartida(db, c.peladaId, c.laranja, c.verde, depois(9 * MIN));
    expect(await filaDeTimes(db, c.peladaId)).toEqual([c.laranja, c.verde, c.preto, c.azul]); // em andamento não conta
    await encerrarPartida(db, p2, depois(17 * MIN)); // 0 × 0: saem os dois
    expect(await filaDeTimes(db, c.peladaId)).toEqual([c.preto, c.azul, c.laranja, c.verde]);
  });

  it('pelada sem times: fila e histórico vazios', async () => {
    const peladaId = await novaPelada(HOJE);
    expect(await filaDeTimes(db, peladaId)).toEqual([]);
    expect(await historicoDaPelada(db, peladaId)).toEqual([]);
  });
});

describe('partidasAbertasDeOutrasPeladas (Parte 5)', () => {
  it('acha partida que ninguém encerrou numa pelada anterior, com data, cores e placar', async () => {
    const semanaPassada = await novaPelada('2026-11-04');
    const [x1, x2, y1] = await criar(['Xavier', 'Yuri', 'Zeca']);
    await salvarTimesDefinitivos(db, semanaPassada, [[x1, x2], [y1]]);
    const [t1, t2] = (await timesDaPelada(db, semanaPassada)).map((t) => t.id);
    const quarta = new Date('2026-11-04T21:00:00-03:00');
    const aberta = await iniciarPartida(db, semanaPassada, t1, t2, quarta);
    await registrarLance(db, aberta, x1, 'gol');
    const encerrada = await iniciarPartida(db, semanaPassada, t2, t1, quarta).catch(() => null);
    expect(encerrada).toBeNull(); // só uma em andamento por pelada

    const c = await cenario();
    const rolandoHoje = await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);

    expect(await partidasAbertasDeOutrasPeladas(db, c.peladaId)).toEqual([
      { id: aberta, data: '2026-11-04', corA: 'azul', corB: 'laranja', placar: { A: 1, B: 0 } },
    ]);
    // Sem pelada atual (nenhuma até hoje): todas as abertas.
    expect((await partidasAbertasDeOutrasPeladas(db, null)).map((p) => p.id).sort()).toEqual([aberta, rolandoHoje].sort());

    await encerrarPartida(db, aberta, depois(MIN));
    expect(await partidasAbertasDeOutrasPeladas(db, c.peladaId)).toEqual([]);
  });
});

describe('cancelar pelada com partida (Parte 5, P5-c)', () => {
  it('recusa cancelar quando a pelada já tem partida; os outros estados continuam valendo', async () => {
    const c = await cenario();
    await definirEstadoManual(db, c.peladaId, 'cancelada'); // sem partida: pode
    await definirEstadoManual(db, c.peladaId, null);
    await iniciarPartida(db, c.peladaId, c.azul, c.laranja, NOITE);

    const erro = await definirEstadoManual(db, c.peladaId, 'cancelada').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroLista);
    expect(erro.motivo).toBe('ja_tem_partida');
    expect(erro.message).toBe('Já tem partida jogada nessa pelada; não dá pra cancelar.');
    const [p] = await db.select().from(peladas).where(eq(peladas.id, c.peladaId));
    expect(p.estadoManual).toBeNull();

    await definirEstadoManual(db, c.peladaId, 'fechada');
    await definirEstadoManual(db, c.peladaId, null);
  });
});
