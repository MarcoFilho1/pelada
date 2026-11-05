import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores, peladas } from '@/db/schema';
import { encerrarPartida, iniciarPartida, registrarLance } from '@/server/partidas';
import { estatisticasDoJogador, periodosDisponiveis, rankingDoPeriodo } from '@/server/ranking';
import { salvarTimesDefinitivos, timesDaPelada } from '@/server/times';
import { createTestDb } from '../helpers/db';

let db: DB;
let ana: number, bia: number, caio: number, davi: number;

async function criar(nome: string) {
  const [j] = await db.insert(jogadores).values({ nome }).returning({ id: jogadores.id });
  return j.id;
}

/** Pelada em `data` com 2 times de 2 (Ana+Bia x Caio+Davi) e uma partida encerrada. */
async function peladaJogada(data: string, resultadoPor: (a: { azul: number; laranja: number }) => Promise<void>) {
  const [p] = await db.insert(peladas).values({ data }).returning({ id: peladas.id });
  await salvarTimesDefinitivos(db, p.id, [[ana, bia], [caio, davi]]);
  const [azul, laranja] = (await timesDaPelada(db, p.id)).map((t) => t.id);
  await resultadoPor({ azul, laranja });
  return p.id;
}

async function jogar(peladaId: number, azul: number, laranja: number, lancesFeitos: [number, 'gol' | 'assistencia'][], dia: string) {
  const inicio = new Date(`${dia}T20:40:00-03:00`);
  const id = await iniciarPartida(db, peladaId, azul, laranja, inicio);
  for (const [j, t] of lancesFeitos) await registrarLance(db, id, j, t);
  await encerrarPartida(db, id, new Date(inicio.getTime() + 5 * 60_000));
  return id;
}

beforeEach(async () => {
  db = await createTestDb();
  [ana, bia, caio, davi] = [await criar('Ana'), await criar('Bia'), await criar('Caio'), await criar('Davi')];
});

describe('ranking do servidor', () => {
  async function cenario() {
    // 04/11: Ana+Bia 2x0 Caio+Davi (Ana 2 gols, Bia 1 assist).  11/11: empate 0x0.
    await peladaJogada('2026-11-04', async ({ azul, laranja }) => {
      const [p] = await db.select().from(peladas).where(eq(peladas.data, '2026-11-04'));
      await jogar(p.id, azul, laranja, [[ana, 'gol'], [ana, 'gol'], [bia, 'assistencia']], '2026-11-04');
    });
    await peladaJogada('2026-11-11', async ({ azul, laranja }) => {
      const [p] = await db.select().from(peladas).where(eq(peladas.data, '2026-11-11'));
      const id = await iniciarPartida(db, p.id, azul, laranja, new Date('2026-11-11T20:40:00-03:00'));
      await encerrarPartida(db, id, new Date('2026-11-11T20:48:00-03:00'));
    });
  }

  it('ranking com 2 partidas reais', async () => {
    await cenario();
    const r = await rankingDoPeriodo(db, { tipo: 'geral' });
    expect(r.map((l) => [l.nome, l.pontos])).toEqual([
      ['Ana', 3 + 2 + 1],
      ['Bia', 3 + 1 + 1],
      ['Caio', 1],
      ['Davi', 1],
    ]);
    expect(r[0]).toMatchObject({ jogos: 2, vitorias: 1, empates: 1, gols: 2, presencas: 2 });
    const nov = await rankingDoPeriodo(db, { tipo: 'mes', ano: 2026, mes: 11 });
    expect(nov).toHaveLength(4);
    expect(await rankingDoPeriodo(db, { tipo: 'mes', ano: 2026, mes: 10 })).toEqual([]);
  });

  it('partida aberta não conta; inativos somem por padrão', async () => {
    await cenario();
    const [p] = await db.insert(peladas).values({ data: '2026-11-18' }).returning({ id: peladas.id });
    await salvarTimesDefinitivos(db, p.id, [[ana, bia], [caio, davi]]);
    const [azul, laranja] = (await timesDaPelada(db, p.id)).map((t) => t.id);
    const id = await iniciarPartida(db, p.id, azul, laranja, new Date('2026-11-18T20:40:00-03:00'));
    await registrarLance(db, id, ana, 'gol');
    expect((await rankingDoPeriodo(db, { tipo: 'geral' })).find((l) => l.nome === 'Ana')!.jogos).toBe(2);

    await db.update(jogadores).set({ ativo: false }).where(eq(jogadores.id, davi));
    expect((await rankingDoPeriodo(db, { tipo: 'geral' })).map((l) => l.nome)).not.toContain('Davi');
    expect((await rankingDoPeriodo(db, { tipo: 'geral' }, { incluirInativos: true })).map((l) => l.nome)).toContain('Davi');
  });

  it('estatísticas do jogador: linha + histórico por quarta (inativo também)', async () => {
    await cenario();
    await db.update(jogadores).set({ ativo: false }).where(eq(jogadores.id, ana));
    const e = await estatisticasDoJogador(db, ana, { tipo: 'geral' });
    expect(e.linha).toMatchObject({ nome: 'Ana', pontos: 6 });
    expect(e.historico).toEqual([
      { peladaData: '2026-11-11', jogos: 1, vitorias: 0, empates: 1, derrotas: 0, gols: 0, assistencias: 0 },
      { peladaData: '2026-11-04', jogos: 1, vitorias: 1, empates: 0, derrotas: 0, gols: 2, assistencias: 0 },
    ]);
    const vazio = await estatisticasDoJogador(db, ana, { tipo: 'ano', ano: 2025 });
    expect(vazio).toEqual({ linha: null, historico: [] });
  });

  it('periodosDisponiveis: anos e meses com partida encerrada, mais recentes primeiro', async () => {
    expect(await periodosDisponiveis(db)).toEqual({ anos: [], meses: [] });
    await cenario();
    expect(await periodosDisponiveis(db)).toEqual({ anos: [2026], meses: ['2026-11'] });
  });
});
