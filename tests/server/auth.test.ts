import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores } from '@/db/schema';
import { buscarJogadoresPorNome, entrarJogador, trocarPin } from '@/server/auth';
import { createTestDb } from '../helpers/db';

const now = new Date('2026-11-04T12:00:00-03:00');
const minutos = (m: number) => new Date(now.getTime() + m * 60_000);

let db: DB;

async function criarJogador(nome: string, extra: Partial<typeof jogadores.$inferInsert> = {}) {
  const [j] = await db.insert(jogadores).values({ nome, ...extra }).returning();
  return j;
}

async function lerJogador(id: number) {
  const [j] = await db.select().from(jogadores).where(eq(jogadores.id, id));
  return j;
}

beforeEach(async () => {
  db = await createTestDb();
});

describe('entrarJogador', () => {
  it('jogador novo entra com 1234 e precisa trocar', async () => {
    const caio = await criarJogador('Caio');
    expect(await entrarJogador(db, caio.id, '1234', now)).toEqual({ ok: true, precisaTrocar: true });
  });

  it('PIN errado conta erro; acerto zera a contagem', async () => {
    const caio = await criarJogador('Caio');
    expect(await entrarJogador(db, caio.id, '0000', now)).toEqual({ ok: false, motivo: 'pin_errado' });
    expect((await lerJogador(caio.id)).pinErros).toBe(1);
    await entrarJogador(db, caio.id, '1234', now);
    expect((await lerJogador(caio.id)).pinErros).toBe(0);
  });

  it('5 PINs errados bloqueiam; o 6º com o PIN certo dá bloqueado', async () => {
    const caio = await criarJogador('Caio');
    for (let i = 0; i < 4; i++) {
      expect(await entrarJogador(db, caio.id, '0000', now)).toEqual({ ok: false, motivo: 'pin_errado' });
    }
    expect(await entrarJogador(db, caio.id, '0000', now)).toEqual({ ok: false, motivo: 'bloqueado' });
    expect(await entrarJogador(db, caio.id, '1234', minutos(1))).toEqual({ ok: false, motivo: 'bloqueado' });
  });

  it('bloqueado não confere o PIN nem conta erro', async () => {
    const caio = await criarJogador('Caio', { bloqueadoAte: minutos(10), pinErros: 0 });
    expect(await entrarJogador(db, caio.id, '0000', now)).toEqual({ ok: false, motivo: 'bloqueado' });
    expect((await lerJogador(caio.id)).pinErros).toBe(0);
    expect((await lerJogador(caio.id)).bloqueadoAte).toEqual(minutos(10));
  });

  it('depois de 15 minutos o bloqueio acaba', async () => {
    const caio = await criarJogador('Caio');
    for (let i = 0; i < 5; i++) await entrarJogador(db, caio.id, '0000', now);
    expect(await entrarJogador(db, caio.id, '1234', minutos(15))).toEqual({ ok: true, precisaTrocar: true });
    expect((await lerJogador(caio.id)).bloqueadoAte).toBeNull();
  });

  it('jogador inativo ou inexistente não entra', async () => {
    const zeca = await criarJogador('Zeca', { ativo: false });
    expect(await entrarJogador(db, zeca.id, '1234', now)).toEqual({ ok: false, motivo: 'pin_errado' });
    expect(await entrarJogador(db, 9999, '1234', now)).toEqual({ ok: false, motivo: 'pin_errado' });
  });
});

describe('trocarPin', () => {
  it('recusa 1234 e PIN inválido', async () => {
    const caio = await criarJogador('Caio');
    await expect(trocarPin(db, caio.id, '1234')).rejects.toThrow();
    await expect(trocarPin(db, caio.id, '12a4')).rejects.toThrow();
    await expect(trocarPin(db, caio.id, '12345')).rejects.toThrow();
  });

  it('com PIN novo, entra sem precisar trocar e o PIN antigo para de valer', async () => {
    const caio = await criarJogador('Caio');
    await trocarPin(db, caio.id, '7788');
    expect(await entrarJogador(db, caio.id, '7788', now)).toEqual({ ok: true, precisaTrocar: false });
    expect(await entrarJogador(db, caio.id, '1234', now)).toEqual({ ok: false, motivo: 'pin_errado' });
    expect((await lerJogador(caio.id)).pinHash).not.toContain('7788');
  });

  it('lança erro para jogador inexistente', async () => {
    await expect(trocarPin(db, 9999, '7788')).rejects.toThrow();
  });
});

describe('buscarJogadoresPorNome', () => {
  it('acha por parte do nome, sem diferenciar maiúsculas, só ativos', async () => {
    const caio = await criarJogador('Caio');
    await criarJogador('Lucas');
    await criarJogador('Carlos', { ativo: false });
    await criarJogador('Pepe');
    const achados = await buscarJogadoresPorNome(db, 'ca');
    expect(achados).toEqual([
      { id: caio.id, nome: 'Caio' },
      { id: expect.any(Number), nome: 'Lucas' },
    ]);
  });

  it('devolve no máximo 8 e nada para termo vazio', async () => {
    for (let i = 1; i <= 10; i++) await criarJogador(`Jogador ${i}`);
    expect(await buscarJogadoresPorNome(db, 'jog')).toHaveLength(8);
    expect(await buscarJogadoresPorNome(db, '   ')).toEqual([]);
  });

  it('trata % e _ como texto, não como curinga', async () => {
    await criarJogador('Caio');
    expect(await buscarJogadoresPorNome(db, '%')).toEqual([]);
    expect(await buscarJogadoresPorNome(db, 'C_io')).toEqual([]);
  });
});
