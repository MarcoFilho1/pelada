import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores, peladas } from '@/db/schema';
import { consultar } from '@/robo/consultas';
import { encerrarPartida, iniciarPartida, registrarLance } from '@/server/partidas';
import { rankingDoPeriodo } from '@/server/ranking';
import { salvarTimesDefinitivos, timesDaPelada } from '@/server/times';
import { createTestDb } from '../helpers/db';

let db: DB;
let ana: number, bia: number, caio: number, davi: number;
const NOVEMBRO = new Date('2026-11-10T10:00:00-03:00');
const DEZEMBRO = new Date('2026-12-02T10:00:00-03:00');

async function criar(nome: string) {
  const [j] = await db.insert(jogadores).values({ nome }).returning({ id: jogadores.id });
  return j.id;
}

/** 04/11: Ana+Bia 2x0 Caio+Davi (Ana 2 gols, Caio... nada; Bia 1 assistência, Davi 1 gol contra não existe). */
async function novembroJogado() {
  const [p] = await db.insert(peladas).values({ data: '2026-11-04' }).returning({ id: peladas.id });
  await salvarTimesDefinitivos(db, p.id, [[ana, bia], [caio, davi]]);
  const [azul, laranja] = (await timesDaPelada(db, p.id)).map((t) => t.id);
  const inicio = new Date('2026-11-04T20:40:00-03:00');
  const id = await iniciarPartida(db, p.id, azul, laranja, inicio);
  for (const [j, t] of [[ana, 'gol'], [ana, 'gol'], [bia, 'gol'], [bia, 'assistencia'], [davi, 'assistencia']] as const) await registrarLance(db, id, j, t);
  await encerrarPartida(db, id, new Date(inicio.getTime() + 5 * 60_000));
}

beforeEach(async () => {
  db = await createTestDb();
  [ana, bia, caio, davi] = [await criar('Ana'), await criar('Bia'), await criar('Caio'), await criar('Davi')];
});

describe('consultas do robô (artilheiro, garçom, ranking, times)', () => {
  it('sem partidas: frases curtas', async () => {
    expect(await consultar(db, 'artilheiro', NOVEMBRO)).toBe('Ninguém fez gol ainda.');
    expect(await consultar(db, 'garcom', NOVEMBRO)).toBe('Ninguém deu assistência ainda.');
    expect(await consultar(db, 'ranking', NOVEMBRO)).toBe('Ainda não tem partida no ranking.');
  });

  it('mês atual com partida: os 3 primeiros em gols e em assistências', async () => {
    await novembroJogado();
    expect(await consultar(db, 'artilheiro', NOVEMBRO)).toBe('Artilheiros (novembro):\n1. Ana 2\n2. Bia 1');
    expect(await consultar(db, 'garcom', NOVEMBRO)).toBe('Garçons (novembro):\n1. Bia 1\n2. Davi 1');
  });

  it('ranking: os 5 primeiros em pontos, na ordem do site', async () => {
    await novembroJogado();
    const site = await rankingDoPeriodo(db, { tipo: 'mes', ano: 2026, mes: 11 });
    const esperado = site.slice(0, 5).map((l, i) => `${i + 1}. ${l.nome} ${l.pontos}`);
    expect(await consultar(db, 'ranking', NOVEMBRO)).toBe(`Ranking (novembro):\n${esperado.join('\n')}`);
  });

  it('mês atual sem partida: geral', async () => {
    await novembroJogado();
    expect(await consultar(db, 'artilheiro', DEZEMBRO)).toBe('Artilheiros (geral):\n1. Ana 2\n2. Bia 1');
  });

  it('artilheiros: no máximo 3', async () => {
    await novembroJogado();
    const [p] = await db.insert(peladas).values({ data: '2026-11-11' }).returning({ id: peladas.id });
    await salvarTimesDefinitivos(db, p.id, [[ana, caio], [bia, davi]]);
    const [azul, laranja] = (await timesDaPelada(db, p.id)).map((t) => t.id);
    const inicio = new Date('2026-11-11T20:40:00-03:00');
    const id = await iniciarPartida(db, p.id, azul, laranja, inicio);
    for (const j of [caio, davi]) await registrarLance(db, id, j, 'gol');
    await encerrarPartida(db, id, new Date(inicio.getTime() + 5 * 60_000));
    const linhas = (await consultar(db, 'artilheiro', NOVEMBRO)).split('\n');
    expect(linhas).toHaveLength(4);
    expect(linhas[1]).toBe('1. Ana 2');
  });

  it('times: só os da pelada de hoje, com COMPLETE; sem times, avisa', async () => {
    const quarta = new Date('2026-11-11T19:00:00-03:00');
    expect(await consultar(db, 'times', quarta)).toBe('Os times de hoje ainda não foram sorteados.');
    await novembroJogado(); // pelada de 04/11 tem times, mas não é hoje
    expect(await consultar(db, 'times', quarta)).toBe('Os times de hoje ainda não foram sorteados.');
    const [p] = await db.insert(peladas).values({ data: '2026-11-11' }).returning({ id: peladas.id });
    expect(await consultar(db, 'times', quarta)).toBe('Os times de hoje ainda não foram sorteados.');
    await salvarTimesDefinitivos(db, p.id, [[ana, bia, caio], [davi]], [[], [3]]);
    expect(await consultar(db, 'times', quarta)).toBe('Times de hoje:\n\nAzul\n- Ana\n- Bia\n- Caio\n\nLaranja\n- Davi\n- COMPLETE');
    await db.update(jogadores).set({ nome: 'Ana Maria' }).where(eq(jogadores.id, ana));
    expect(await consultar(db, 'times', quarta)).toContain('- Ana Maria');
  });
});
