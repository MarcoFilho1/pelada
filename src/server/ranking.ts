import { and, desc, eq, gte, inArray, isNotNull, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DB } from '@/db/client';
import { jogadores, lances, partidaJogadores, partidas, peladas, times } from '@/db/schema';
import {
  calcularRanking,
  historicoDoJogador,
  intervaloDoPeriodo,
  type LinhaRanking,
  type LinhaRankingComNota,
  type PartidaEncerrada,
  type Periodo,
  type QuartaDoJogador,
} from '@/domain/ranking';

const timeA = alias(times, 'time_a');
const timeB = alias(times, 'time_b');

/** Partidas encerradas com resultado cuja quarta cai no período, com as cores dos dois times: 3 consultas, sem N+1. */
async function partidasEncerradas(db: DB, periodo: Periodo): Promise<PartidaEncerrada[]> {
  const intervalo = intervaloDoPeriodo(periodo);
  const ps = await db
    .select({
      id: partidas.id,
      peladaData: peladas.data,
      encerradaEm: partidas.encerradaEm,
      resultado: partidas.resultado,
      corA: timeA.cor,
      corB: timeB.cor,
    })
    .from(partidas)
    .innerJoin(peladas, eq(partidas.peladaId, peladas.id))
    .innerJoin(timeA, eq(partidas.timeAId, timeA.id))
    .innerJoin(timeB, eq(partidas.timeBId, timeB.id))
    .where(
      and(
        isNotNull(partidas.encerradaEm),
        isNotNull(partidas.resultado),
        intervalo ? gte(peladas.data, intervalo.de) : undefined,
        intervalo ? lt(peladas.data, intervalo.ate) : undefined,
      ),
    );
  if (!ps.length) return [];
  const ids = ps.map((p) => p.id);
  const [elenco, ls] = await Promise.all([
    db
      .select({ partidaId: partidaJogadores.partidaId, jogadorId: partidaJogadores.jogadorId, lado: partidaJogadores.lado })
      .from(partidaJogadores)
      .where(inArray(partidaJogadores.partidaId, ids)),
    db
      .select({ partidaId: lances.partidaId, jogadorId: lances.jogadorId, tipo: lances.tipo })
      .from(lances)
      .where(inArray(lances.partidaId, ids)),
  ]);
  const elencoDe = new Map<number, PartidaEncerrada['elenco']>();
  for (const e of elenco) (elencoDe.get(e.partidaId) ?? elencoDe.set(e.partidaId, []).get(e.partidaId)!).push({ jogadorId: e.jogadorId, lado: e.lado });
  const lancesDe = new Map<number, PartidaEncerrada['lances']>();
  for (const l of ls) (lancesDe.get(l.partidaId) ?? lancesDe.set(l.partidaId, []).get(l.partidaId)!).push({ jogadorId: l.jogadorId, tipo: l.tipo });
  return ps.map((p) => ({
    id: p.id,
    peladaData: p.peladaData,
    encerradaEm: p.encerradaEm!,
    resultado: p.resultado!,
    corA: p.corA,
    corB: p.corB,
    elenco: elencoDe.get(p.id) ?? [],
    lances: lancesDe.get(p.id) ?? [],
  }));
}

/**
 * Ranking do período, com a nota de cada um (notas são públicas). Só lista jogadores ativos
 * (quem parou de vir some das listas); `incluirInativos` traz todos. Quem não jogou no período não aparece.
 */
export async function rankingDoPeriodo(
  db: DB,
  periodo: Periodo,
  opcoes: { incluirInativos?: boolean } = {},
): Promise<LinhaRankingComNota[]> {
  const [ps, js] = await Promise.all([
    partidasEncerradas(db, periodo),
    db.select({ id: jogadores.id, nome: jogadores.nome, ativo: jogadores.ativo, nota: jogadores.nota }).from(jogadores),
  ]);
  const porId = new Map(js.map((j) => [j.id, j]));
  const linhas = calcularRanking(ps, new Map(js.map((j) => [j.id, j.nome])), periodo)
    .filter((l) => opcoes.incluirInativos || porId.get(l.jogadorId)?.ativo)
    .map((l): LinhaRankingComNota => ({ ...l, nota: Number(porId.get(l.jogadorId)?.nota ?? 0) }));
  return linhas;
}

/** Linha do jogador no período (null se não jogou) e histórico por quarta, mais recente primeiro. Vale para inativos. */
export async function estatisticasDoJogador(
  db: DB,
  jogadorId: number,
  periodo: Periodo,
): Promise<{ linha: LinhaRanking | null; historico: QuartaDoJogador[] }> {
  const ps = await partidasEncerradas(db, periodo);
  const [j] = await db.select({ nome: jogadores.nome }).from(jogadores).where(eq(jogadores.id, jogadorId));
  const nomes = new Map<number, string>(j ? [[jogadorId, j.nome]] : []);
  const linha = calcularRanking(ps, nomes, periodo).find((l) => l.jogadorId === jogadorId) ?? null;
  return { linha, historico: historicoDoJogador(ps, jogadorId) };
}

/** Anos e meses ('YYYY-MM') com ao menos uma partida encerrada, mais recentes primeiro. */
export async function periodosDisponiveis(db: DB): Promise<{ anos: number[]; meses: string[] }> {
  const datas = await db
    .selectDistinct({ data: peladas.data })
    .from(partidas)
    .innerJoin(peladas, eq(partidas.peladaId, peladas.id))
    .where(and(isNotNull(partidas.encerradaEm), isNotNull(partidas.resultado)))
    .orderBy(desc(peladas.data));
  const meses = [...new Set(datas.map((d) => d.data.slice(0, 7)))];
  const anos = [...new Set(meses.map((m) => Number(m.slice(0, 4))))];
  return { anos, meses };
}
