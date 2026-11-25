import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { jogadores, partidas, peladas } from '@/db/schema';
import { ErroPartida, gravarPartidaDoApp, type PartidaDoApp } from './partidas';
import { timesDaPelada } from './times';

// A anotação feita no app do celular, sem internet (docs/android.md). O app baixa os times da
// pelada quando tem rede, anota as partidas guardando tudo no aparelho e, quando a rede volta,
// manda cada partida inteira para cá. Cada partida tem uma identificação criada no app (`origem`):
// mandar a mesma duas vezes não grava duas.

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ORIGEM = /^[A-Za-z0-9-]{8,64}$/;
/** Uma noite tem umas 15 partidas; o teto só segura um envio absurdo. */
export const MAX_PARTIDAS = 60;
const MAX_LANCES = 200;
const MAX_TEMPO_MS = 6 * 60 * 60_000;

const inteiroPositivo = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const idsDe = (v: unknown, max: number): number[] | null => (Array.isArray(v) && v.length <= max && v.every(inteiroPositivo) ? (v as number[]) : null);
const lado = (v: unknown): v is 'A' | 'B' => v === 'A' || v === 'B';
function instante(v: unknown): Date | null {
  if (typeof v !== 'string' || v.length > 40) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function limparPartida(bruto: unknown): PartidaDoApp | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const b = bruto as Record<string, unknown>;
  const iniciadaEm = instante(b.iniciadaEm);
  const encerradaEm = instante(b.encerradaEm);
  const completam = (b.completam ?? { A: [], B: [] }) as Record<string, unknown>;
  const goleiros = (b.goleiros ?? { A: null, B: null }) as Record<string, unknown>;
  if (typeof completam !== 'object' || completam === null || typeof goleiros !== 'object' || goleiros === null) return null;
  const cA = idsDe(completam.A ?? [], 5);
  const cB = idsDe(completam.B ?? [], 5);
  const gol = (v: unknown) => v === null || v === undefined || inteiroPositivo(v);
  if (
    typeof b.origem !== 'string' ||
    !ORIGEM.test(b.origem) ||
    !inteiroPositivo(b.timeAId) ||
    !inteiroPositivo(b.timeBId) ||
    !iniciadaEm ||
    !encerradaEm ||
    typeof b.pausadoMs !== 'number' ||
    !Number.isSafeInteger(b.pausadoMs) ||
    b.pausadoMs < 0 ||
    b.pausadoMs > MAX_TEMPO_MS ||
    !(b.desempate === null || b.desempate === undefined || lado(b.desempate)) ||
    !cA ||
    !cB ||
    !gol(goleiros.A) ||
    !gol(goleiros.B) ||
    !Array.isArray(b.lances) ||
    b.lances.length > MAX_LANCES
  ) {
    return null;
  }
  const lances: PartidaDoApp['lances'] = [];
  for (const l of b.lances as unknown[]) {
    if (typeof l !== 'object' || l === null) return null;
    const x = l as Record<string, unknown>;
    if (!inteiroPositivo(x.jogadorId) || !(x.tipo === 'gol' || x.tipo === 'assistencia')) return null;
    if (typeof x.tempoMs !== 'number' || !Number.isSafeInteger(x.tempoMs) || x.tempoMs < 0 || x.tempoMs > MAX_TEMPO_MS) return null;
    lances.push({ jogadorId: x.jogadorId, tipo: x.tipo, tempoMs: x.tempoMs });
  }
  return {
    origem: b.origem,
    timeAId: b.timeAId,
    timeBId: b.timeBId,
    iniciadaEm,
    encerradaEm,
    pausadoMs: b.pausadoMs,
    desempate: lado(b.desempate) ? b.desempate : null,
    completam: { A: cA, B: cB },
    goleiros: { A: (goleiros.A as number | null | undefined) ?? null, B: (goleiros.B as number | null | undefined) ?? null },
    lances,
  };
}

export type Envio = { data: string; partidas: PartidaDoApp[] };

/** Confere o formato do que o app mandou. `null` se não é um envio. Pura. */
export function limparEnvio(bruto: unknown): Envio | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const b = bruto as Record<string, unknown>;
  if (typeof b.data !== 'string' || !DATA.test(b.data) || !Array.isArray(b.partidas) || b.partidas.length > MAX_PARTIDAS) return null;
  const ps: PartidaDoApp[] = [];
  for (const p of b.partidas as unknown[]) {
    const limpa = limparPartida(p);
    if (!limpa) return null;
    ps.push(limpa);
  }
  return { data: b.data, partidas: ps };
}

export type ResultadoDoEnvio = { origem: string } & ({ situacao: 'gravada' | 'repetida'; id: number } | { situacao: 'recusada'; motivo: string });

/**
 * Grava as partidas do envio, na ordem, cada uma na sua transação: uma recusada (time que não
 * existe mais, jogador de fora) não impede as outras. O app guarda as recusadas para quem cuida ver.
 * `null`: não existe pelada nessa data.
 */
export async function receberEnvio(db: DB, envio: Envio): Promise<ResultadoDoEnvio[] | null> {
  const [pelada] = await db.select({ id: peladas.id }).from(peladas).where(eq(peladas.data, envio.data));
  if (!pelada) return null;
  const respostas: ResultadoDoEnvio[] = [];
  for (const p of envio.partidas) {
    try {
      respostas.push({ origem: p.origem, ...(await gravarPartidaDoApp(db, pelada.id, p)) });
    } catch (e) {
      if (!(e instanceof ErroPartida)) throw e;
      respostas.push({ origem: p.origem, situacao: 'recusada', motivo: e.motivo });
    }
  }
  return respostas;
}

export type ParaAnotar = {
  peladaId: number;
  data: string;
  /** Os times do sorteio, na ordem; `vagas`: quantos COMPLETE o time tem. Vazio: ainda sem sorteio. */
  times: { id: number; cor: string; ordem: number; vagas: number; jogadores: { id: number; nome: string }[] }[];
  /** Todos os jogadores ativos: de onde saem quem completa e os goleiros. */
  jogadores: { id: number; nome: string; agarra: boolean }[];
  /** As partidas já encerradas da pelada, na ordem: o app continua a fila de onde ela parou. */
  partidas: { timeAId: number; timeBId: number; resultado: 'A' | 'B' | 'empate'; desempate: 'A' | 'B' | null; origem: string | null }[];
};

/** O que o app precisa guardar para anotar a pelada dessa data sem internet. `null`: não há pelada. */
export async function lerParaAnotar(db: DB, data: string): Promise<ParaAnotar | null> {
  if (!DATA.test(data)) return null;
  const [pelada] = await db.select({ id: peladas.id }).from(peladas).where(eq(peladas.data, data));
  if (!pelada) return null;
  const ts = await timesDaPelada(db, pelada.id);
  const ativos = await db
    .select({ id: jogadores.id, nome: jogadores.nome, agarra: jogadores.agarra })
    .from(jogadores)
    .where(eq(jogadores.ativo, true))
    .orderBy(asc(jogadores.nome));
  const jogadas = await db
    .select({ timeAId: partidas.timeAId, timeBId: partidas.timeBId, resultado: partidas.resultado, desempate: partidas.desempate, origem: partidas.origem })
    .from(partidas)
    .where(and(eq(partidas.peladaId, pelada.id), isNotNull(partidas.encerradaEm), isNotNull(partidas.resultado)))
    .orderBy(asc(partidas.iniciadaEm), asc(partidas.id));
  return {
    peladaId: pelada.id,
    data,
    times: ts.map((t) => ({ id: t.id, cor: t.cor, ordem: t.ordem, vagas: t.completes.length, jogadores: t.jogadores.map((j) => ({ id: j.id, nome: j.nome })) })),
    jogadores: ativos,
    partidas: jogadas.map((p) => ({ ...p, resultado: p.resultado! })),
  };
}
