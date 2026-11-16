import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { peladas } from '@/db/schema';
import { criarLinkAnotador, peladaDaPartida, validarChaveAnotador, vencimentoDoLink } from '@/server/anotador';
import { acessoNaPelada } from '@/server/sessao';
import { createTestDb } from '../helpers/db';

const QUARTA = new Date('2026-11-18T19:00:00-03:00');
let db: DB;

beforeEach(async () => {
  db = await createTestDb();
});

describe('vencimentoDoLink', () => {
  it('3h da manhã seguinte, horário de Recife', () => {
    expect(vencimentoDoLink('2026-11-18').toISOString()).toBe('2026-11-19T06:00:00.000Z');
    expect(vencimentoDoLink('2026-12-31').toISOString()).toBe('2027-01-01T06:00:00.000Z');
  });
});

describe('criarLinkAnotador / validarChaveAnotador', () => {
  it('sem pelada hoje: recusa', async () => {
    expect(await criarLinkAnotador(db, 'Marco', QUARTA)).toEqual({ ok: false, motivo: 'sem_pelada_hoje' });
  });

  it('cria uma chave de 43 caracteres que vale para a pelada de hoje até as 3h; o banco não guarda a chave', async () => {
    const [p] = await db.insert(peladas).values({ data: '2026-11-18' }).returning();
    const r = await criarLinkAnotador(db, 'Marco', QUARTA);
    if (!r.ok) throw new Error('esperava link');
    expect(r.chave).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await validarChaveAnotador(db, r.chave, QUARTA)).toEqual({ peladaId: p.id, expiraEm: new Date('2026-11-19T06:00:00.000Z') });
    expect(await validarChaveAnotador(db, r.chave, new Date('2026-11-19T02:59:00-03:00'))).not.toBeNull();
    expect(await validarChaveAnotador(db, r.chave, new Date('2026-11-19T03:00:00-03:00'))).toBeNull();
    const linhas = await db.query.linksAnotador.findMany();
    expect(JSON.stringify(linhas)).not.toContain(r.chave);
  });

  it('um link novo revoga o anterior da mesma pelada', async () => {
    await db.insert(peladas).values({ data: '2026-11-18' });
    const a = await criarLinkAnotador(db, 'Marco', QUARTA);
    const b = await criarLinkAnotador(db, 'Pepe', QUARTA);
    if (!a.ok || !b.ok) throw new Error('esperava link');
    expect(await validarChaveAnotador(db, a.chave, QUARTA)).toBeNull();
    expect(await validarChaveAnotador(db, b.chave, QUARTA)).not.toBeNull();
  });

  it('chave vazia, fora do formato ou inventada: nada', async () => {
    for (const chave of [undefined, '', 'curta', 'x'.repeat(43)]) expect(await validarChaveAnotador(db, chave, QUARTA)).toBeNull();
  });

  it('peladaDaPartida: inexistente é null', async () => {
    expect(await peladaDaPartida(db, 999)).toBeNull();
  });
});

describe('acessoNaPelada', () => {
  it('admin vale para todas; anotador só para a dele; sem acesso, nada', () => {
    expect(acessoNaPelada({ tipo: 'admin' }, 5)).toBe(true);
    expect(acessoNaPelada({ tipo: 'admin' }, null)).toBe(true);
    expect(acessoNaPelada({ tipo: 'anotador', peladaId: 5 }, 5)).toBe(true);
    expect(acessoNaPelada({ tipo: 'anotador', peladaId: 5 }, 6)).toBe(false);
    expect(acessoNaPelada({ tipo: 'anotador', peladaId: 5 }, null)).toBe(false);
    expect(acessoNaPelada(null, 5)).toBe(false);
  });
});
