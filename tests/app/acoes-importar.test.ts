import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores, peladas } from '@/db/schema';
import { iniciarPartida } from '@/server/partidas';
import { timesDaPelada } from '@/server/times';
import { createTestDb } from '../helpers/db';

// "Importar times" com o banco de verdade (PGlite): só a sessão e o Next são dublês.
let db: DB;
let sessao: { adminId: number } | null = { adminId: 1 };
vi.mock('@/db/client', () => ({ getDb: () => db }));
vi.mock('@/server/sessao', () => ({ lerSessaoAdmin: async () => sessao }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const { importarTimes, previaDeImportar } = await import('@/app/admin/(area)/sorteio/acoes');

const HOJE = '2026-11-11';
const COLADO = 'Pelada 11/11 - 20:30-22:30\n\nTime 1 (12.0)\n1. Ana 4.5\n2. Beto 1.0\n\nTime 2 (11.5)\n1. Caio 4,0\n2. Davi\n3. COMPLETE 2.5';
let peladaId: number;

beforeEach(async () => {
  sessao = { adminId: 1 };
  db = await createTestDb();
  [{ id: peladaId }] = await db.insert(peladas).values({ data: HOJE }).returning();
  await db.insert(jogadores).values([
    { nome: 'Ana', nota: '3.0' },
    { nome: 'Beto', nota: '2.5' },
    { nome: 'Caio', nota: '4.0' },
    { nome: 'Davi Lima', nota: '3.5' },
    { nome: 'Edu', nota: '3.0', ativo: false },
  ]);
});

describe('previaDeImportar', () => {
  it('casa os nomes com os ativos e devolve a nota do cadastro (a colada não vale)', async () => {
    const r = await previaDeImportar(COLADO);
    if (!r.ok) throw new Error(r.erro);
    expect(r.previa.pronto).toBe(true);
    expect(r.previa.times.map((t) => t.nomes.map((n) => (n.tipo === 'ok' ? `${n.jogador.nome} ${n.jogador.nota}` : n.escrito)))).toEqual([
      ['Ana 3', 'Beto 2.5'],
      ['Caio 4', 'Davi Lima 3.5'],
    ]);
    expect(r.previa.times[1].completes).toEqual([2.5]);
  });

  it('inativo não casa; pedido estranho é recusado; sem sessão vai para o login', async () => {
    const r = await previaDeImportar('Time 1\nAna\nTime 2\nEdu');
    expect(r.ok && r.previa.times[1].nomes[0].tipo).toBe('nao_achei');
    // @ts-expect-error de propósito: o cliente pode mandar qualquer coisa
    expect(await previaDeImportar(42)).toEqual({ ok: false, erro: 'Pedido inválido.' });
    expect(await previaDeImportar('x'.repeat(5000))).toEqual({ ok: false, erro: 'Pedido inválido.' });
    expect(await previaDeImportar('Ana')).toEqual({ ok: false, erro: 'Cole de 2 a 4 times.' });
    sessao = null;
    await expect(previaDeImportar(COLADO)).rejects.toThrow('redirect:/admin/entrar');
  });
});

describe('importarTimes', () => {
  it('salva exatamente a prévia: Azul e Laranja, o COMPLETE no Laranja, e as notas não mudam', async () => {
    expect(await importarTimes(peladaId, COLADO)).toEqual({ ok: true });
    const ts = await timesDaPelada(db, peladaId);
    expect(ts.map((t) => [t.cor, t.jogadores.map((j) => j.nome).sort(), t.completes.map((c) => c.nota)])).toEqual([
      ['azul', ['Ana', 'Beto'], []],
      ['laranja', ['Caio', 'Davi Lima'], [2.5]],
    ]);
    const notas = (await db.select({ nome: jogadores.nome, nota: jogadores.nota }).from(jogadores)).map((j) => `${j.nome} ${j.nota}`);
    expect(notas).toContain('Ana 3.0');
    expect(notas).toContain('Beto 2.5');
  });

  it('nome sem jogador ou repetido: não salva nada', async () => {
    expect(await importarTimes(peladaId, 'Time 1\nAna\nTime 2\nZé')).toEqual({ ok: false, erro: 'Tem nome que não achou jogador (ou repetido). Confira a prévia.' });
    expect(await importarTimes(peladaId, 'Time 1\nAna\nTime 2\nana')).toMatchObject({ ok: false });
    expect(await timesDaPelada(db, peladaId)).toEqual([]);
  });

  it('com partida em andamento recusa e os times continuam os de antes', async () => {
    expect(await importarTimes(peladaId, COLADO)).toEqual({ ok: true });
    const [azul, laranja] = (await timesDaPelada(db, peladaId)).map((t) => t.id);
    await iniciarPartida(db, peladaId, azul, laranja, new Date('2026-11-11T20:40:00-03:00'));
    const r = await importarTimes(peladaId, 'Time 1\nAna\nCaio\nTime 2\nBeto\nDavi');
    expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/andamento/i) });
    expect((await timesDaPelada(db, peladaId)).map((t) => t.id)).toEqual([azul, laranja]);
  });

  it('pedido estranho: recusado sem tocar no banco', async () => {
    // @ts-expect-error de propósito
    expect(await importarTimes('1', COLADO)).toEqual({ ok: false, erro: 'Pedido inválido.' });
    // @ts-expect-error de propósito
    expect(await importarTimes(peladaId, null)).toEqual({ ok: false, erro: 'Pedido inválido.' });
  });
});
