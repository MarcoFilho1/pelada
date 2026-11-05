import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { jogadores, partidas, peladas, timeCompletes, timeJogadores, times } from '@/db/schema';
import { CORES, type Cor, type JogadorNota } from '@/domain/sorteio';
import { ErroDeValidacao } from './erros';
import { listarJogadores, notaValida } from './jogadores';
import { estadoDaPelada } from './presencas';

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export type CompleteDoTime = { id: number; nota: number };
export type TimeDaPelada = { id: number; cor: Cor; ordem: number; jogadores: JogadorNota[]; completes: CompleteDoTime[] };

const VAGAS_POR_TIME = 4;

export type MotivoTimes =
  | 'partida_em_andamento'
  | 'nota_invalida'
  | 'ja_tem_time'
  | 'time_cheio'
  | 'pelada_inexistente'
  | 'quantidade_de_times'
  | 'time_vazio'
  | 'jogador_repetido'
  | 'jogador_inativo'
  | 'time_inexistente'
  | 'fora_do_time'
  | 'peladas_diferentes'
  | 'pedido_invalido';

const MENSAGENS: Record<MotivoTimes, string> = {
  partida_em_andamento: 'Tem partida em andamento; encerre antes de sortear de novo.',
  nota_invalida: 'Nota inválida. Use de 0 a 5, de 0,5 em 0,5.',
  ja_tem_time: 'Esse jogador já está em um time. Recarregue a página.',
  time_cheio: 'Esse time já está completo (4 vagas).',
  pelada_inexistente: 'Essa pelada não existe mais. Recarregue a página.',
  quantidade_de_times: `Monte de 1 a ${CORES.length} times.`,
  time_vazio: 'Todo time precisa de pelo menos um jogador.',
  jogador_repetido: 'O mesmo jogador está em dois times.',
  jogador_inativo: 'Tem jogador desativado ou que não existe. Recarregue a página.',
  time_inexistente: 'Esse time não existe mais. Recarregue a página.',
  fora_do_time: 'Esse jogador já não está nesse time. Recarregue a página.',
  peladas_diferentes: 'Os dois times são de peladas diferentes.',
  pedido_invalido: 'Pedido inválido.',
};

export class ErroTimes extends ErroDeValidacao {
  constructor(public readonly motivo: MotivoTimes) {
    super(MENSAGENS[motivo]);
    this.name = 'ErroTimes';
  }
}

const porNota = (a: JogadorNota, b: JogadorNota) => b.nota - a.nota || a.nome.localeCompare(b.nome, 'pt-BR');

/** Quem entra no sorteio por padrão: os confirmados da lista principal (mesma leitura da lista), com a nota. */
export async function participantesPadrao(db: DB, peladaId: number, now: Date): Promise<JogadorNota[]> {
  const estado = await estadoDaPelada(db, peladaId, now);
  const notas = new Map((await listarJogadores(db, { incluirInativos: false })).map((j) => [j.id, j.nota]));
  return estado.principal
    .filter((i) => i.confirmado && notas.has(i.jogadorId))
    .map((i) => ({ id: i.jogadorId, nome: i.nome, nota: notas.get(i.jogadorId)! }));
}

/** Trava a linha da pelada: mudanças nos times da mesma pelada andam uma de cada vez. */
async function travarPelada(tx: Tx, peladaId: number): Promise<void> {
  const [p] = await tx.select({ id: peladas.id }).from(peladas).where(eq(peladas.id, peladaId)).for('update');
  if (!p) throw new ErroTimes('pelada_inexistente');
}

async function todosAtivos(tx: Tx, ids: number[]): Promise<boolean> {
  if (!ids.length) return true;
  const achados = await tx
    .select({ id: jogadores.id })
    .from(jogadores)
    .where(and(inArray(jogadores.id, ids), eq(jogadores.ativo, true)));
  return achados.length === new Set(ids).size;
}

/**
 * Marca os times como definitivos. Cores na ordem azul, laranja, verde, preto; `completes[i]` são
 * as notas dos COMPLETE do time `i`. Sem partida na pelada, os times antigos são apagados. Com
 * partida, são arquivados (as partidas apontam para eles) e os novos passam a ser os atuais.
 */
export async function salvarTimesDefinitivos(
  db: DB,
  peladaId: number,
  elencos: number[][],
  completes: number[][] = [],
  now = new Date(),
): Promise<void> {
  if (elencos.length < 1 || elencos.length > CORES.length) throw new ErroTimes('quantidade_de_times');
  if (elencos.some((e) => e.length === 0)) throw new ErroTimes('time_vazio');
  if (completes.flat().some((n) => !notaValida(n))) throw new ErroTimes('nota_invalida');
  if (completes.length > elencos.length) throw new ErroTimes('pedido_invalido');
  if (elencos.some((e, i) => e.length + (completes[i]?.length ?? 0) > VAGAS_POR_TIME)) throw new ErroTimes('time_cheio');
  const ids = elencos.flat();
  if (new Set(ids).size !== ids.length) throw new ErroTimes('jogador_repetido');

  await db.transaction(async (tx) => {
    await travarPelada(tx, peladaId);
    const daPelada = await tx.select({ id: partidas.id, encerradaEm: partidas.encerradaEm }).from(partidas).where(eq(partidas.peladaId, peladaId));
    if (daPelada.some((p) => p.encerradaEm === null)) throw new ErroTimes('partida_em_andamento');
    if (!(await todosAtivos(tx, ids))) throw new ErroTimes('jogador_inativo');

    const antigos = await tx.select({ id: times.id }).from(times).where(and(eq(times.peladaId, peladaId), isNull(times.arquivadoEm)));
    if (antigos.length) {
      const idsAntigos = antigos.map((t) => t.id);
      if (daPelada.length) {
        await tx.update(times).set({ arquivadoEm: now }).where(inArray(times.id, idsAntigos));
      } else {
        await tx.delete(timeCompletes).where(inArray(timeCompletes.timeId, idsAntigos));
        await tx.delete(timeJogadores).where(inArray(timeJogadores.timeId, idsAntigos));
        await tx.delete(times).where(inArray(times.id, idsAntigos));
      }
    }

    const novos = await tx
      .insert(times)
      .values(elencos.map((_, i) => ({ peladaId, cor: CORES[i], ordem: i + 1 })))
      .returning({ id: times.id, ordem: times.ordem });
    const idPorOrdem = new Map(novos.map((t) => [t.ordem, t.id]));
    await tx
      .insert(timeJogadores)
      .values(elencos.flatMap((e, i) => e.map((jogadorId) => ({ timeId: idPorOrdem.get(i + 1)!, jogadorId }))));
    const linhasComplete = elencos.flatMap((_, i) =>
      (completes[i] ?? []).map((nota) => ({ timeId: idPorOrdem.get(i + 1)!, nota: nota.toFixed(1) })),
    );
    if (linhasComplete.length) await tx.insert(timeCompletes).values(linhasComplete);
  });
}

/** Os times da pelada em ordem, cada um com os jogadores (nota em número), do mais forte ao mais fraco. */
export async function timesDaPelada(db: DB, peladaId: number): Promise<TimeDaPelada[]> {
  const ts = await db
    .select({ id: times.id, cor: times.cor, ordem: times.ordem })
    .from(times)
    .where(and(eq(times.peladaId, peladaId), isNull(times.arquivadoEm)))
    .orderBy(times.ordem);
  if (!ts.length) return [];
  const idsTimes = ts.map((t) => t.id);
  const cs = await db
    .select({ id: timeCompletes.id, timeId: timeCompletes.timeId, nota: timeCompletes.nota })
    .from(timeCompletes)
    .where(inArray(timeCompletes.timeId, idsTimes))
    .orderBy(timeCompletes.id);
  const linhas = await db
    .select({ timeId: timeJogadores.timeId, id: jogadores.id, nome: jogadores.nome, nota: jogadores.nota })
    .from(timeJogadores)
    .innerJoin(jogadores, eq(jogadores.id, timeJogadores.jogadorId))
    .where(
      inArray(
        timeJogadores.timeId,
        ts.map((t) => t.id),
      ),
    );
  return ts.map((t) => ({
    ...t,
    jogadores: linhas
      .filter((l) => l.timeId === t.id)
      .map((l) => ({ id: l.id, nome: l.nome, nota: Number(l.nota) }))
      .sort(porNota),
    completes: cs.filter((c) => c.timeId === t.id).map((c) => ({ id: c.id, nota: Number(c.nota) })),
  }));
}

/** Quantas partidas já foram encerradas na pelada e se há uma em andamento (sorteio novo só sem partida aberta). */
export async function partidasJogadas(db: DB, peladaId: number): Promise<{ jogadas: number; emAndamento: boolean }> {
  const ps = await db.select({ encerradaEm: partidas.encerradaEm }).from(partidas).where(eq(partidas.peladaId, peladaId));
  return { jogadas: ps.filter((p) => p.encerradaEm !== null).length, emAndamento: ps.some((p) => p.encerradaEm === null) };
}

/**
 * Entre partidas: troca o jogador de time (`de` → `para`), tira (`para` = null) ou põe quem
 * estava fora (`de` = null). Um jogador fica em um time só por pelada: pôr num time tira do
 * time antigo na mesma transação. Jogador desativado não entra em time, mas pode sair.
 */
export async function moverJogador(db: DB, jogadorId: number, deTimeId: number | null, paraTimeId: number | null): Promise<void> {
  if (deTimeId === null && paraTimeId === null) throw new ErroTimes('pedido_invalido');
  if (deTimeId === paraTimeId) return;
  const pedidos = [deTimeId, paraTimeId].filter((id): id is number => id !== null);

  await db.transaction(async (tx) => {
    const peladaDe = async () => {
      const achados = await tx
        .select({ id: times.id, peladaId: times.peladaId })
        .from(times)
        .where(and(inArray(times.id, pedidos), isNull(times.arquivadoEm)));
      if (achados.length !== pedidos.length) throw new ErroTimes('time_inexistente');
      if (new Set(achados.map((t) => t.peladaId)).size > 1) throw new ErroTimes('peladas_diferentes');
      return achados[0].peladaId;
    };
    const peladaId = await peladaDe();
    await travarPelada(tx, peladaId);
    await peladaDe(); // um sorteio refeito enquanto esperava a trava pode ter apagado os times

    if (deTimeId !== null) {
      const [esta] = await tx
        .select({ id: timeJogadores.jogadorId })
        .from(timeJogadores)
        .where(and(eq(timeJogadores.timeId, deTimeId), eq(timeJogadores.jogadorId, jogadorId)));
      if (!esta) throw new ErroTimes('fora_do_time');
    }
    if (paraTimeId !== null && !(await todosAtivos(tx, [jogadorId]))) throw new ErroTimes('jogador_inativo');

    // Sai de qualquer time desta pelada (o de origem e um eventual outro) e entra no destino.
    const daPelada = (
      await tx.select({ id: times.id }).from(times).where(and(eq(times.peladaId, peladaId), isNull(times.arquivadoEm)))
    ).map((t) => t.id);
    await tx.delete(timeJogadores).where(and(eq(timeJogadores.jogadorId, jogadorId), inArray(timeJogadores.timeId, daPelada)));
    if (paraTimeId !== null) await tx.insert(timeJogadores).values({ timeId: paraTimeId, jogadorId });
  });
}

/** Trava a pelada do time e confere que ele existe e é atual (não arquivado). Devolve a pelada. */
async function travarTimeAtual(tx: Tx, timeId: number): Promise<number> {
  const achar = async () => {
    const [t] = await tx.select({ peladaId: times.peladaId, arquivadoEm: times.arquivadoEm }).from(times).where(eq(times.id, timeId));
    if (!t || t.arquivadoEm !== null) throw new ErroTimes('time_inexistente');
    return t.peladaId;
  };
  const peladaId = await achar();
  await travarPelada(tx, peladaId);
  await achar(); // um sorteio novo enquanto esperava a trava pode ter arquivado o time
  return peladaId;
}

async function completeAtual(tx: Tx, completeId: number): Promise<{ id: number; timeId: number }> {
  const [c] = await tx.select({ id: timeCompletes.id, timeId: timeCompletes.timeId }).from(timeCompletes).where(eq(timeCompletes.id, completeId));
  if (!c) throw new ErroTimes('time_inexistente');
  return c;
}

/** Acrescenta um COMPLETE ao time (até 4 entre jogadores e COMPLETE). Devolve o id. */
export async function adicionarComplete(db: DB, timeId: number, nota: number): Promise<number> {
  if (!notaValida(nota)) throw new ErroTimes('nota_invalida');
  return db.transaction(async (tx) => {
    await travarTimeAtual(tx, timeId);
    const [{ n: jogs }] = await tx.select({ n: sql<number>`count(*)::int` }).from(timeJogadores).where(eq(timeJogadores.timeId, timeId));
    const [{ n: comps }] = await tx.select({ n: sql<number>`count(*)::int` }).from(timeCompletes).where(eq(timeCompletes.timeId, timeId));
    if (jogs + comps >= VAGAS_POR_TIME) throw new ErroTimes('time_cheio');
    const [novo] = await tx.insert(timeCompletes).values({ timeId, nota: nota.toFixed(1) }).returning({ id: timeCompletes.id });
    return novo.id;
  });
}

export async function removerComplete(db: DB, completeId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const c = await completeAtual(tx, completeId);
    await travarTimeAtual(tx, c.timeId);
    await completeAtual(tx, completeId);
    await tx.delete(timeCompletes).where(eq(timeCompletes.id, completeId));
  });
}

export async function mudarNotaComplete(db: DB, completeId: number, nota: number): Promise<void> {
  if (!notaValida(nota)) throw new ErroTimes('nota_invalida');
  await db.transaction(async (tx) => {
    const c = await completeAtual(tx, completeId);
    await travarTimeAtual(tx, c.timeId);
    await completeAtual(tx, completeId);
    await tx.update(timeCompletes).set({ nota: nota.toFixed(1) }).where(eq(timeCompletes.id, completeId));
  });
}

/** Troca o COMPLETE por um jogador de verdade, na mesma transação. Recusa inativo ou quem já está num time atual. */
export async function preencherComplete(db: DB, completeId: number, jogadorId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const c = await completeAtual(tx, completeId);
    const peladaId = await travarTimeAtual(tx, c.timeId);
    await completeAtual(tx, completeId);
    if (!(await todosAtivos(tx, [jogadorId]))) throw new ErroTimes('jogador_inativo');
    const [ja] = await tx
      .select({ id: timeJogadores.jogadorId })
      .from(timeJogadores)
      .innerJoin(times, eq(times.id, timeJogadores.timeId))
      .where(and(eq(timeJogadores.jogadorId, jogadorId), eq(times.peladaId, peladaId), isNull(times.arquivadoEm)));
    if (ja) throw new ErroTimes('ja_tem_time');
    await tx.delete(timeCompletes).where(eq(timeCompletes.id, completeId));
    await tx.insert(timeJogadores).values({ timeId: c.timeId, jogadorId });
  });
}
