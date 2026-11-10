import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores, partidas, peladas, presencas, times } from '@/db/schema';
import { confirmarSorteio, ehAdmin, proporSorteio, TEXTO_SO_ADMIN, type Proposta } from '@/robo/sorteio-zap';
import { timesDaPelada } from '@/server/times';
import { createTestDb } from '../helpers/db';

let db: DB;
let peladaId: number;
// terça 10/11/2026 12:00 em Recife; a pelada é quarta 2026-11-11, então "hoje" = quarta 12:00 Recife
const QUARTA = new Date('2026-11-11T15:00:00Z');
const ADMIN = '5581990000001';
let semente = 0;
const rng = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);

async function tudo() {
  const r = await db.execute(sql`
    select (select coalesce(json_agg(t order by t::text), '[]') from times t) t,
           (select coalesce(json_agg(t order by t::text), '[]') from time_jogadores t) tj,
           (select coalesce(json_agg(t order by t::text), '[]') from time_completes t) tc,
           (select coalesce(json_agg(t order by t::text), '[]') from peladas t) p,
           (select coalesce(json_agg(t order by t::text), '[]') from presencas t) pr,
           (select coalesce(json_agg(t order by t::text), '[]') from partidas t) pa`);
  return JSON.stringify((r as unknown as { rows: unknown[] }).rows);
}

beforeEach(async () => {
  semente = 7;
  db = await createTestDb();
  [{ id: peladaId }] = await db.insert(peladas).values({ data: '2026-11-11' }).returning();
  const nomes = ['Ana', 'Beto', 'Caio', 'Davi', 'Edu', 'Fabio', 'Gil', 'Hugo', 'Ivo', 'Jonas'];
  const js = await db.insert(jogadores).values(nomes.map((nome, i) => ({ nome, nota: (2 + (i % 4)).toFixed(1) }))).returning();
  await db.insert(presencas).values(js.map((j) => ({ peladaId, jogadorId: j.id, tipo: 'M' as const, status: 'confirmado' as const })));
});

describe('ehAdmin', () => {
  it('compara só dígitos, com ou sem 55 e com ou sem o 9 extra', () => {
    const admins = ['+55 (81) 99000-0001'];
    for (const t of ['5581990000001', '81990000001', '558190000001', '8190000001', '+55 81 99000-0001']) expect(ehAdmin(t, admins)).toBe(true);
    for (const t of ['5581990000002', '', '55', '5511990000001', 'abc']) expect(ehAdmin(t, admins)).toBe(false);
  });
  it('admin cadastrado sem o 9 também casa com quem manda com o 9', () => {
    expect(ehAdmin('5581990000001', ['558190000001'])).toBe(true);
  });
  it('lista vazia não tem admin', () => expect(ehAdmin('5581990000001', [])).toBe(false));
  it('texto fixo', () => expect(TEXTO_SO_ADMIN).toBe('Só os organizadores podem sortear pelo WhatsApp.'));
});

describe('proporSorteio', () => {
  it('propõe sem gravar nada e monta o texto', async () => {
    const antes = await tudo();
    const p = (await proporSorteio(db, QUARTA, ADMIN, rng)) as Proposta;
    expect(await tudo()).toBe(antes);
    expect(p.peladaId).toBe(peladaId);
    expect(p.adminTelefone).toBe(ADMIN);
    expect(p.criadaEm).toEqual(QUARTA);
    expect(p.elencos.flat()).toHaveLength(10);
    expect(p.completes).toHaveLength(p.elencos.length);
    expect(p.texto).toMatch(/^Azul \(\d+,\d\)\n- \S+ \d,\d/);
    expect(p.texto).toContain('- COMPLETE ');
    expect(p.texto).toMatch(/\n\nDiferença: \d+,\d\nConfirma\? Responda \*sim\* em até 10 minutos\.$/);
  });

  it('sem pelada hoje ou com poucos confirmados devolve erro e não cria nada', async () => {
    const antes = await tudo();
    expect(await proporSorteio(db, new Date('2026-11-18T15:00:00Z'), ADMIN, rng)).toEqual({ erro: 'Hoje não tem pelada para sortear.' });
    expect(await tudo()).toBe(antes);
    await db.execute(sql`update presencas set status = 'removido' where id > 1`);
    expect(await proporSorteio(db, QUARTA, ADMIN, rng)).toEqual({ erro: 'Poucos confirmados para sortear.' });
  });
});

describe('confirmarSorteio', () => {
  const proposta = async () => (await proporSorteio(db, QUARTA, ADMIN, rng)) as Proposta;
  const mais = (min: number, s = 0) => new Date(QUARTA.getTime() + min * 60_000 + s * 1000);

  it('mesmo admin grava times iguais aos da proposta (aceita variação do número)', async () => {
    const p = await proposta();
    expect(await confirmarSorteio(db, mais(9, 59), '81990000001', p)).toEqual({ ok: 'Times definitivos salvos.' });
    const ts = await timesDaPelada(db, peladaId);
    expect(ts.map((t) => t.jogadores.map((j) => j.id).sort())).toEqual(p.elencos.map((e) => [...e].sort()));
    expect(ts.map((t) => t.completes.map((c) => c.nota))).toEqual(p.completes);
  });

  it('sem proposta', async () => {
    expect(await confirmarSorteio(db, QUARTA, ADMIN, null)).toEqual({ erro: 'Não tem sorteio esperando confirmação.' });
  });

  it('outro telefone não grava', async () => {
    const antes = await tudo();
    expect(await confirmarSorteio(db, mais(1), '5581990000002', await proposta())).toEqual({ erro: 'Só quem pediu o sorteio pode confirmar.' });
    expect(await tudo()).toBe(antes);
  });

  it('com 10 minutos ou mais não grava', async () => {
    const p = await proposta();
    const antes = await tudo();
    expect(await confirmarSorteio(db, mais(10), ADMIN, p)).toEqual({ erro: 'A proposta expirou. Peça *sortear* de novo.' });
    expect(await confirmarSorteio(db, mais(30), ADMIN, p)).toEqual({ erro: 'A proposta expirou. Peça *sortear* de novo.' });
    expect(await tudo()).toBe(antes);
  });

  it('partida em andamento: repassa o erro do site e não grava', async () => {
    const p = await proposta();
    expect(await confirmarSorteio(db, mais(1), ADMIN, p)).toEqual({ ok: 'Times definitivos salvos.' });
    const [a, b] = await db.select().from(times);
    await db.insert(partidas).values({ peladaId, timeAId: a.id, timeBId: b.id });
    const antes = await tudo();
    const r = await confirmarSorteio(db, mais(2), ADMIN, p);
    expect(r).toEqual({ erro: 'Tem partida em andamento; encerre antes de sortear de novo.' });
    expect(await tudo()).toBe(antes);
  });
});
