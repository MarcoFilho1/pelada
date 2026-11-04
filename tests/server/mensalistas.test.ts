import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores, mensalistasMes } from '@/db/schema';
import { mesDe } from '@/domain/tempo';
import { definirMensalistas, mensalistasDoMes, previaMensalistasDoMes } from '@/server/mensalistas';
import { createTestDb } from '../helpers/db';

let db: DB;

async function criarJogadores(n: number, extra: Partial<typeof jogadores.$inferInsert> = {}) {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const [j] = await db.insert(jogadores).values({ nome: `J${ids.length}-${Math.random()}`, ...extra }).returning();
    ids.push(j.id);
  }
  return ids;
}

const ordenar = (v: number[]) => [...v].sort((a, b) => a - b);

beforeEach(async () => {
  db = await createTestDb();
});

describe('mesDe', () => {
  it('usa o fuso de Recife (UTC-3)', () => {
    expect(mesDe(new Date('2026-12-01T02:00:00Z'))).toBe('2026-11');
    expect(mesDe(new Date('2026-12-01T03:00:00Z'))).toBe('2026-12');
    expect(mesDe(new Date('2026-11-15T12:00:00Z'))).toBe('2026-11');
  });
});

describe('definirMensalistas', () => {
  it('mais de 16 lança max_16 e não grava nada', async () => {
    const ids = await criarJogadores(17);
    await expect(definirMensalistas(db, '2026-11', ids)).rejects.toThrow('max_16');
    expect(await db.select().from(mensalistasMes)).toHaveLength(0);
  });

  it('aceita 16 e troca o conjunto do mês por inteiro, sem mexer em outros meses', async () => {
    const ids = await criarJogadores(18);
    await definirMensalistas(db, '2026-10', ids.slice(0, 3));
    await definirMensalistas(db, '2026-11', ids.slice(0, 16));
    expect(ordenar(await mensalistasDoMes(db, '2026-11'))).toEqual(ids.slice(0, 16));
    await definirMensalistas(db, '2026-11', ids.slice(16, 18));
    expect(ordenar(await mensalistasDoMes(db, '2026-11'))).toEqual(ids.slice(16, 18));
    expect(ordenar(await mensalistasDoMes(db, '2026-10'))).toEqual(ids.slice(0, 3));
  });

  it('ids repetidos contam uma vez', async () => {
    const [a] = await criarJogadores(1);
    await definirMensalistas(db, '2026-11', [a, a]);
    expect(await mensalistasDoMes(db, '2026-11')).toEqual([a]);
  });

  it('id desconhecido ou de jogador inativo dá erro e mantém o mês como estava', async () => {
    const [a, b] = await criarJogadores(2);
    const [inativo] = await criarJogadores(1, { ativo: false });
    await definirMensalistas(db, '2026-11', [a]);
    await expect(definirMensalistas(db, '2026-11', [a, 9999])).rejects.toThrow();
    await expect(definirMensalistas(db, '2026-11', [b, inativo])).rejects.toThrow();
    expect(await mensalistasDoMes(db, '2026-11')).toEqual([a]);
  });

  it('lista vazia lança min_1 e mantém o mês como estava', async () => {
    const [a] = await criarJogadores(1);
    await definirMensalistas(db, '2026-11', [a]);
    await expect(definirMensalistas(db, '2026-11', [])).rejects.toThrow('min_1');
    expect(await mensalistasDoMes(db, '2026-11')).toEqual([a]);
  });

  it('recusa mês fora do formato YYYY-MM', async () => {
    await expect(definirMensalistas(db, '2026-13', [])).rejects.toThrow();
    await expect(definirMensalistas(db, 'novembro', [])).rejects.toThrow();
  });
});

describe('previaMensalistasDoMes', () => {
  it('mês vazio devolve a cópia do anterior sem gravar nada', async () => {
    const ids = await criarJogadores(3);
    await definirMensalistas(db, '2026-10', ids);
    const p = await previaMensalistasDoMes(db, '2026-11');
    expect(ordenar(p.ids)).toEqual(ids);
    expect(p.copiado).toBe(true);
    expect(p.origem).toBe('2026-10');
    expect(await db.select().from(mensalistasMes).where(eq(mensalistasMes.mes, '2026-11'))).toHaveLength(0);
    // mudança no mês atual ainda se propaga ao mês futuro que só foi visto
    await definirMensalistas(db, '2026-10', ids.slice(0, 1));
    expect((await previaMensalistasDoMes(db, '2026-11')).ids).toEqual(ids.slice(0, 1));
  });

  it('mês com registros devolve os dele, sem histórico devolve vazio', async () => {
    const ids = await criarJogadores(2);
    await definirMensalistas(db, '2026-11', ids);
    expect(await previaMensalistasDoMes(db, '2026-11')).toMatchObject({ copiado: false, origem: null });
    expect(await previaMensalistasDoMes(db, '2026-01')).toEqual({ ids: [], copiado: false, origem: null });
  });
});

describe('mensalistasDoMes', () => {
  it('mês com registros devolve os dele', async () => {
    const ids = await criarJogadores(3);
    await definirMensalistas(db, '2026-11', ids.slice(0, 2));
    expect(ordenar(await mensalistasDoMes(db, '2026-11'))).toEqual(ids.slice(0, 2));
  });

  it('mês vazio copia o mês anterior mais recente, devolve e grava', async () => {
    const ids = await criarJogadores(4);
    await definirMensalistas(db, '2026-08', [ids[3]]);
    await definirMensalistas(db, '2026-10', ids.slice(0, 3));
    expect(ordenar(await mensalistasDoMes(db, '2026-11'))).toEqual(ids.slice(0, 3));
    const gravados = await db.select().from(mensalistasMes).where(eq(mensalistasMes.mes, '2026-11'));
    expect(ordenar(gravados.map((g) => g.jogadorId))).toEqual(ids.slice(0, 3));
  });

  it('só copia jogadores ativos', async () => {
    const [a, b] = await criarJogadores(2);
    await definirMensalistas(db, '2026-10', [a, b]);
    await db.update(jogadores).set({ ativo: false }).where(eq(jogadores.id, b));
    expect(await mensalistasDoMes(db, '2026-11')).toEqual([a]);
    const [linhaB] = await db
      .select()
      .from(mensalistasMes)
      .where(and(eq(mensalistasMes.mes, '2026-11'), eq(mensalistasMes.jogadorId, b)));
    expect(linhaB).toBeUndefined();
  });

  it('não copia de mês posterior nem inventa nada sem histórico', async () => {
    const [a] = await criarJogadores(1);
    await definirMensalistas(db, '2027-01', [a]);
    expect(await mensalistasDoMes(db, '2026-11')).toEqual([]);
    expect(await db.select().from(mensalistasMes).where(eq(mensalistasMes.mes, '2026-11'))).toHaveLength(0);
  });

  it('chamadas simultâneas no mês vazio não duplicam nem falham', async () => {
    const ids = await criarJogadores(3);
    await definirMensalistas(db, '2026-10', ids);
    const [x, y] = await Promise.all([mensalistasDoMes(db, '2026-11'), mensalistasDoMes(db, '2026-11')]);
    expect(ordenar(x)).toEqual(ids);
    expect(ordenar(y)).toEqual(ids);
    expect(await db.select().from(mensalistasMes).where(eq(mensalistasMes.mes, '2026-11'))).toHaveLength(3);
  });
});
