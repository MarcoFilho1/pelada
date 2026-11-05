import { and, eq, inArray } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { jogadores, partidas, peladas, timeJogadores, times } from '@/db/schema';
import { CORES, type Cor, type JogadorNota } from '@/domain/sorteio';
import { ErroDeValidacao } from './erros';
import { listarJogadores } from './jogadores';
import { estadoDaPelada } from './presencas';

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export type TimeDaPelada = { id: number; cor: Cor; ordem: number; jogadores: JogadorNota[] };

export type MotivoTimes =
  | 'ja_tem_partida'
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
  ja_tem_partida: 'Já tem partida jogada; edite os times em vez de sortear de novo.',
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
 * Marca os times como definitivos, substituindo os que a pelada já tinha. Cores na ordem azul,
 * laranja, verde, preto. Depois da primeira partida não dá mais (as partidas apontam para os
 * times); aí os times se editam com `moverJogador`.
 */
export async function salvarTimesDefinitivos(db: DB, peladaId: number, elencos: number[][]): Promise<void> {
  if (elencos.length < 1 || elencos.length > CORES.length) throw new ErroTimes('quantidade_de_times');
  if (elencos.some((e) => e.length === 0)) throw new ErroTimes('time_vazio');
  const ids = elencos.flat();
  if (new Set(ids).size !== ids.length) throw new ErroTimes('jogador_repetido');

  await db.transaction(async (tx) => {
    await travarPelada(tx, peladaId);
    const [partida] = await tx.select({ id: partidas.id }).from(partidas).where(eq(partidas.peladaId, peladaId)).limit(1);
    if (partida) throw new ErroTimes('ja_tem_partida');
    if (!(await todosAtivos(tx, ids))) throw new ErroTimes('jogador_inativo');

    const antigos = await tx.select({ id: times.id }).from(times).where(eq(times.peladaId, peladaId));
    if (antigos.length) {
      const idsAntigos = antigos.map((t) => t.id);
      await tx.delete(timeJogadores).where(inArray(timeJogadores.timeId, idsAntigos));
      await tx.delete(times).where(inArray(times.id, idsAntigos));
    }

    const novos = await tx
      .insert(times)
      .values(elencos.map((_, i) => ({ peladaId, cor: CORES[i], ordem: i + 1 })))
      .returning({ id: times.id, ordem: times.ordem });
    const idPorOrdem = new Map(novos.map((t) => [t.ordem, t.id]));
    await tx
      .insert(timeJogadores)
      .values(elencos.flatMap((e, i) => e.map((jogadorId) => ({ timeId: idPorOrdem.get(i + 1)!, jogadorId }))));
  });
}

/** Os times da pelada em ordem, cada um com os jogadores (nota em número), do mais forte ao mais fraco. */
export async function timesDaPelada(db: DB, peladaId: number): Promise<TimeDaPelada[]> {
  const ts = await db
    .select({ id: times.id, cor: times.cor, ordem: times.ordem })
    .from(times)
    .where(eq(times.peladaId, peladaId))
    .orderBy(times.ordem);
  if (!ts.length) return [];
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
  }));
}

/** Já teve partida nesta pelada (aí o sorteio não pode ser refeito). */
export async function temPartida(db: DB, peladaId: number): Promise<boolean> {
  const [p] = await db.select({ id: partidas.id }).from(partidas).where(eq(partidas.peladaId, peladaId)).limit(1);
  return !!p;
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
      const achados = await tx.select({ id: times.id, peladaId: times.peladaId }).from(times).where(inArray(times.id, pedidos));
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
    const daPelada = (await tx.select({ id: times.id }).from(times).where(eq(times.peladaId, peladaId))).map((t) => t.id);
    await tx.delete(timeJogadores).where(and(eq(timeJogadores.jogadorId, jogadorId), inArray(timeJogadores.timeId, daPelada)));
    if (paraTimeId !== null) await tx.insert(timeJogadores).values({ timeId: paraTimeId, jogadorId });
  });
}
