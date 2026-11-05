import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores } from '@/db/schema';
import { entrarJogador, trocarPin, validarSessaoJogador } from '@/server/auth';
import {
  atualizarJogador,
  criarJogadores,
  listarJogadores,
  NomeEmUsoError,
  parseNomesColados,
  zerarPin,
} from '@/server/jogadores';
import { createTestDb } from '../helpers/db';

const now = new Date('2026-11-04T12:00:00-03:00');

let db: DB;

async function ler(id: number) {
  const [j] = await db.select().from(jogadores).where(eq(jogadores.id, id));
  return j;
}

beforeEach(async () => {
  db = await createTestDb();
});

describe('parseNomesColados', () => {
  it('um nome por linha, sem numeração, marcas nem emojis', () => {
    expect(parseNomesColados('1. Pepe (M) ✅\n\n 2. Caio\n6. Manoel (?) ✅')).toEqual(['Pepe', 'Caio', 'Manoel']);
  });

  it('tira (D), ⏳, numeração com parêntese ou hífen e espaços sobrando', () => {
    expect(parseNomesColados('3) Zeca (D) ⏳\r\n4 - João   da  Silva\n  \n(M)')).toEqual(['Zeca', 'João da Silva']);
  });

  it('não corta números que fazem parte do nome', () => {
    expect(parseNomesColados('Zé 10\n7Up')).toEqual(['Zé 10', '7Up']);
  });
});

describe('criarJogadores', () => {
  it('cria com nota 3,0, PIN padrão e troca obrigatória', async () => {
    const r = await criarJogadores(db, ['  Pepe ', '', 'Caio']);
    expect(r).toEqual({ criados: ['Pepe', 'Caio'], ignorados: [] });
    const [pepe] = await db.select().from(jogadores).where(eq(jogadores.nome, 'Pepe'));
    expect(pepe).toMatchObject({ nota: '3.0', pinHash: null, pinPrecisaTrocar: true, ativo: true });
    expect(await entrarJogador(db, pepe.id, '1234', now)).toEqual({ ok: true, precisaTrocar: true });
  });

  it('ignora nome que já existe', async () => {
    await criarJogadores(db, ['Pepe']);
    expect(await criarJogadores(db, ['Pepe', 'Caio'])).toEqual({ criados: ['Caio'], ignorados: ['Pepe'] });
  });

  it('Joao e João, ou caixa diferente, são o mesmo nome; vale também dentro do lote e para inativos', async () => {
    await criarJogadores(db, ['João', 'Zeca']);
    await atualizarJogador(db, (await listarJogadores(db, { incluirInativos: true })).find((j) => j.nome === 'Zeca')!.id, {
      ativo: false,
    });
    const r = await criarJogadores(db, ['Joao', 'JOÃO', 'zeca', 'Caio', 'caio']);
    expect(r).toEqual({ criados: ['Caio'], ignorados: ['Joao', 'JOÃO', 'zeca', 'caio'] });
  });
});

describe('atualizarJogador', () => {
  it('nota só de 0 a 5 em passos de 0,5', async () => {
    const [{ id }] = await db.insert(jogadores).values({ nome: 'Caio' }).returning();
    await expect(atualizarJogador(db, id, { nota: 3.3 })).rejects.toThrow();
    await expect(atualizarJogador(db, id, { nota: 5.5 })).rejects.toThrow();
    await expect(atualizarJogador(db, id, { nota: -0.5 })).rejects.toThrow();
    await expect(atualizarJogador(db, id, { nota: Number.NaN })).rejects.toThrow();
    await atualizarJogador(db, id, { nota: 4.5 });
    expect((await ler(id)).nota).toBe('4.5');
    await atualizarJogador(db, id, { nota: 0 });
    expect((await ler(id)).nota).toBe('0.0');
    await atualizarJogador(db, id, { nota: 5 });
    expect((await ler(id)).nota).toBe('5.0');
  });

  it('renomeia, mas não para um nome que já existe', async () => {
    const [{ id }] = await db.insert(jogadores).values({ nome: 'Caio' }).returning();
    await db.insert(jogadores).values({ nome: 'João' });
    await expect(atualizarJogador(db, id, { nome: 'joao' })).rejects.toBeInstanceOf(NomeEmUsoError);
    await expect(atualizarJogador(db, id, { nome: '   ' })).rejects.toThrow();
    await atualizarJogador(db, id, { nome: ' Caio César ' });
    expect((await ler(id)).nome).toBe('Caio César');
    await atualizarJogador(db, id, { nome: 'CAIO CÉSAR' }); // mudar só a caixa do próprio nome pode
  });

  it('desativar derruba as sessões; reativar não mexe nelas', async () => {
    const [{ id }] = await db.insert(jogadores).values({ nome: 'Caio' }).returning();
    await atualizarJogador(db, id, { ativo: false });
    expect(await ler(id)).toMatchObject({ ativo: false, sessaoVersao: 1 });
    await atualizarJogador(db, id, { ativo: true });
    expect(await ler(id)).toMatchObject({ ativo: true, sessaoVersao: 1 });
  });

  it('só nota não derruba sessão; jogador inexistente dá erro', async () => {
    const [{ id }] = await db.insert(jogadores).values({ nome: 'Caio' }).returning();
    await atualizarJogador(db, id, { nota: 2 });
    expect((await ler(id)).sessaoVersao).toBe(0);
    await expect(atualizarJogador(db, 9999, { nota: 2 })).rejects.toThrow();
  });
});

describe('zerarPin', () => {
  it('volta ao 1234 com troca obrigatória, limpa erros e bloqueio e derruba sessões', async () => {
    const [{ id }] = await db.insert(jogadores).values({ nome: 'Caio' }).returning();
    await trocarPin(db, id, '7788');
    await db
      .update(jogadores)
      .set({ pinErros: 3, bloqueadoAte: new Date(now.getTime() + 600_000) })
      .where(eq(jogadores.id, id));
    const versaoAntes = (await ler(id)).sessaoVersao;

    await zerarPin(db, id);

    expect(await ler(id)).toMatchObject({
      pinHash: null,
      pinPrecisaTrocar: true,
      pinErros: 0,
      bloqueadoAte: null,
      sessaoVersao: versaoAntes + 1,
    });
    expect(await entrarJogador(db, id, '1234', now)).toEqual({ ok: true, precisaTrocar: true });
    expect(await entrarJogador(db, id, '7788', now)).toEqual({ ok: false, motivo: 'pin_errado' });
    expect(
      await validarSessaoJogador(db, { tipo: 'jogador', jogadorId: id, precisaTrocar: false, versao: versaoAntes }),
    ).toBeNull();
  });

  it('jogador inexistente dá erro', async () => {
    await expect(zerarPin(db, 9999)).rejects.toThrow();
  });
});

describe('listarJogadores', () => {
  it('ordena por nome sem acento, traz nota como número e esconde inativos por padrão', async () => {
    await criarJogadores(db, ['Zeca', 'Ágata', 'Bia']);
    const zeca = (await listarJogadores(db, { incluirInativos: false })).find((j) => j.nome === 'Zeca')!;
    await atualizarJogador(db, zeca.id, { ativo: false, nota: 4.5 });
    const ativos = await listarJogadores(db, { incluirInativos: false });
    expect(ativos.map((j) => j.nome)).toEqual(['Ágata', 'Bia']);
    const todos = await listarJogadores(db, { incluirInativos: true });
    expect(todos.map((j) => j.nome)).toEqual(['Ágata', 'Bia', 'Zeca']);
    expect(todos[2]).toMatchObject({ nota: 4.5, ativo: false, pinPadrao: true });
    expect(todos[0].nota).toBe(3);
  });

  it('pinPadrao some depois que o jogador cria o PIN', async () => {
    const [{ id }] = await db.insert(jogadores).values({ nome: 'Caio' }).returning();
    await trocarPin(db, id, '7788');
    expect((await listarJogadores(db, { incluirInativos: false }))[0].pinPadrao).toBe(false);
  });
});
