import { and, asc, desc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { jogadores, lances, partidaJogadores, partidas, peladas, timeJogadores, times } from '@/db/schema';
import {
  filaDepois,
  placar,
  resultadoDoPlacar,
  sugerirEncerrar,
  tempoRestanteMs,
  type Lado,
  type Placar,
  type Resultado,
  type TipoLance,
} from '@/domain/partida';
import type { Cor } from '@/domain/sorteio';
import { dataDe } from '@/domain/tempo';
import { ErroDeValidacao } from './erros';

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
type Partida = typeof partidas.$inferSelect;
type Pelada = typeof peladas.$inferSelect;

export type MotivoPartida =
  | 'pelada_inexistente'
  | 'pelada_nao_e_hoje'
  | 'pelada_cancelada'
  | 'mesmo_time'
  | 'time_vazio'
  | 'time_inexistente'
  | 'partida_em_andamento'
  | 'partida_inexistente'
  | 'ja_encerrada'
  | 'nao_encerrada'
  | 'fora_da_partida'
  | 'lance_inexistente';

const MENSAGENS: Record<MotivoPartida, string> = {
  pelada_inexistente: 'Essa pelada não existe mais. Recarregue a página.',
  pelada_nao_e_hoje: 'Só dá para iniciar partida no dia da pelada.',
  pelada_cancelada: 'A pelada de hoje foi cancelada. Para jogar, tire o cancelamento em Pelada.',
  mesmo_time: 'Escolha dois times diferentes.',
  time_vazio: 'Os dois times precisam de pelo menos um jogador ativo.',
  time_inexistente: 'Esse time não existe mais nesta pelada. Recarregue a página.',
  partida_em_andamento: 'Já tem uma partida em andamento. Encerre essa antes de começar outra.',
  partida_inexistente: 'Essa partida não existe mais. Recarregue a página.',
  ja_encerrada: 'Essa partida já foi encerrada.',
  nao_encerrada: 'Só dá para corrigir uma partida já encerrada.',
  fora_da_partida: 'Esse jogador não está nesta partida.',
  lance_inexistente: 'Esse lance não é desta partida ou já foi apagado. Recarregue a página.',
};

export class ErroPartida extends ErroDeValidacao {
  constructor(public readonly motivo: MotivoPartida) {
    super(MENSAGENS[motivo]);
    this.name = 'ErroPartida';
  }
}

export type LanceNovo = { jogadorId: number; tipo: TipoLance };

/**
 * Trava a linha da pelada. Tudo que mexe em partidas e times da mesma pelada (iniciar, anotar,
 * desfazer, encerrar, corrigir, mover jogador) anda uma operação de cada vez: dois admins no
 * mesmo jogo não se atropelam.
 */
async function travarPelada(tx: Tx, peladaId: number): Promise<{ data: string; estadoManual: Pelada['estadoManual'] }> {
  const [p] = await tx
    .select({ data: peladas.data, estadoManual: peladas.estadoManual })
    .from(peladas)
    .where(eq(peladas.id, peladaId))
    .for('update');
  if (!p) throw new ErroPartida('pelada_inexistente');
  return p;
}

/** Trava a pelada da partida e lê a partida já com a trava (o estado lido antes podia mudar). */
async function travarPartida(tx: Tx, partidaId: number): Promise<Partida> {
  const [antes] = await tx.select({ peladaId: partidas.peladaId }).from(partidas).where(eq(partidas.id, partidaId));
  if (!antes) throw new ErroPartida('partida_inexistente');
  await travarPelada(tx, antes.peladaId);
  const [p] = await tx.select().from(partidas).where(eq(partidas.id, partidaId));
  return p;
}

/** Lado de cada jogador da foto do elenco. */
async function ladosDaPartida(db: DB | Tx, partidaId: number): Promise<Map<number, Lado>> {
  const elenco = await db
    .select({ jogadorId: partidaJogadores.jogadorId, lado: partidaJogadores.lado })
    .from(partidaJogadores)
    .where(eq(partidaJogadores.partidaId, partidaId));
  return new Map(elenco.map((j) => [j.jogadorId, j.lado]));
}

async function placarDaPartida(db: DB | Tx, partidaId: number): Promise<Placar> {
  const ls = await db.select({ jogadorId: lances.jogadorId, tipo: lances.tipo }).from(lances).where(eq(lances.partidaId, partidaId));
  return placar(ls, await ladosDaPartida(db, partidaId));
}

/**
 * Começa uma partida entre dois times da pelada de hoje e grava a foto do elenco (só os jogadores
 * ativos de cada time, com o lado). A foto não muda se os times forem editados depois.
 * Uma partida de cada vez por pelada.
 */
export async function iniciarPartida(db: DB, peladaId: number, timeAId: number, timeBId: number, now: Date): Promise<number> {
  if (timeAId === timeBId) throw new ErroPartida('mesmo_time');
  return db.transaction(async (tx) => {
    const pelada = await travarPelada(tx, peladaId);
    if (pelada.data !== dataDe(now)) throw new ErroPartida('pelada_nao_e_hoje');
    if (pelada.estadoManual === 'cancelada') throw new ErroPartida('pelada_cancelada');

    const daPelada = await tx
      .select({ id: times.id })
      .from(times)
      .where(and(eq(times.peladaId, peladaId), inArray(times.id, [timeAId, timeBId])));
    if (daPelada.length !== 2) throw new ErroPartida('time_inexistente');

    const [rolando] = await tx
      .select({ id: partidas.id })
      .from(partidas)
      .where(and(eq(partidas.peladaId, peladaId), isNull(partidas.encerradaEm)))
      .limit(1);
    if (rolando) throw new ErroPartida('partida_em_andamento');

    const elenco = await tx
      .select({ timeId: timeJogadores.timeId, jogadorId: timeJogadores.jogadorId })
      .from(timeJogadores)
      .innerJoin(jogadores, eq(jogadores.id, timeJogadores.jogadorId))
      .where(and(inArray(timeJogadores.timeId, [timeAId, timeBId]), eq(jogadores.ativo, true)));
    const ladoA = elenco.filter((j) => j.timeId === timeAId);
    const ladoB = elenco.filter((j) => j.timeId === timeBId);
    if (!ladoA.length || !ladoB.length) throw new ErroPartida('time_vazio');

    const [partida] = await tx
      .insert(partidas)
      .values({ peladaId, timeAId, timeBId, iniciadaEm: now })
      .returning({ id: partidas.id });
    await tx.insert(partidaJogadores).values([
      ...ladoA.map((j) => ({ partidaId: partida.id, jogadorId: j.jogadorId, lado: 'A' as const })),
      ...ladoB.map((j) => ({ partidaId: partida.id, jogadorId: j.jogadorId, lado: 'B' as const })),
    ]);
    return partida.id;
  });
}

/** Um toque = um lance (dois toques rápidos são dois gols). Só em partida em andamento, de quem está nela. Devolve o id do lance. */
export async function registrarLance(db: DB, partidaId: number, jogadorId: number, tipo: TipoLance): Promise<number> {
  return db.transaction(async (tx) => {
    const partida = await travarPartida(tx, partidaId);
    if (partida.encerradaEm) throw new ErroPartida('ja_encerrada');
    if (!(await ladosDaPartida(tx, partidaId)).has(jogadorId)) throw new ErroPartida('fora_da_partida');
    const [lance] = await tx.insert(lances).values({ partidaId, jogadorId, tipo }).returning({ id: lances.id });
    return lance.id;
  });
}

/**
 * Apaga o último lance (maior `id`) desta partida e devolve o id dele; sem lances, não faz nada
 * (null). Com `esperadoId` (o último lance que a tela do admin mostrava), só apaga se ele ainda
 * for o último: dois admins tocando Desfazer no mesmo lance tiram um lance só, e um lance que
 * entrou depois não some por engano. Partida encerrada se corrige com `corrigirPartida`.
 */
export async function desfazerUltimo(db: DB, partidaId: number, esperadoId?: number): Promise<number | null> {
  return db.transaction(async (tx) => {
    const partida = await travarPartida(tx, partidaId);
    if (partida.encerradaEm) throw new ErroPartida('ja_encerrada');
    const [ultimo] = await tx
      .select({ id: lances.id })
      .from(lances)
      .where(eq(lances.partidaId, partidaId))
      .orderBy(desc(lances.id))
      .limit(1);
    if (!ultimo || (esperadoId !== undefined && ultimo.id !== esperadoId)) return null;
    await tx.delete(lances).where(eq(lances.id, ultimo.id));
    return ultimo.id;
  });
}

/** Encerra com o resultado do placar (A, B ou empate) e a hora. Devolve o resultado. */
export async function encerrarPartida(db: DB, partidaId: number, now: Date): Promise<Resultado> {
  return db.transaction(async (tx) => {
    const partida = await travarPartida(tx, partidaId);
    if (partida.encerradaEm) throw new ErroPartida('ja_encerrada');
    const resultado = resultadoDoPlacar(await placarDaPartida(tx, partidaId));
    await tx.update(partidas).set({ resultado, encerradaEm: now }).where(eq(partidas.id, partidaId));
    return resultado;
  });
}

/** Aplica a correção já com a trava (tudo ou nada) e grava o resultado recalculado pelo placar. */
async function aplicarCorrecao(tx: Tx, partidaId: number, adicionar: LanceNovo[], remover: number[]): Promise<Resultado> {
  if (remover.length) {
    const apagados = await tx
      .delete(lances)
      .where(and(eq(lances.partidaId, partidaId), inArray(lances.id, remover)))
      .returning({ id: lances.id });
    if (apagados.length !== remover.length) throw new ErroPartida('lance_inexistente');
  }
  if (adicionar.length) {
    const lados = await ladosDaPartida(tx, partidaId);
    if (adicionar.some((l) => !lados.has(l.jogadorId))) throw new ErroPartida('fora_da_partida');
    await tx.insert(lances).values(adicionar.map((l) => ({ partidaId, jogadorId: l.jogadorId, tipo: l.tipo })));
  }
  const resultado = resultadoDoPlacar(await placarDaPartida(tx, partidaId));
  await tx.update(partidas).set({ resultado }).where(eq(partidas.id, partidaId));
  return resultado;
}

/** Trava a partida e confere que ela já foi encerrada (só essas se corrigem). */
async function travarEncerrada(tx: Tx, partidaId: number): Promise<void> {
  const partida = await travarPartida(tx, partidaId);
  if (!partida.encerradaEm) throw new ErroPartida('nao_encerrada');
}

/**
 * Admin corrige uma partida já encerrada: tira lances dela e/ou põe lances novos (de jogadores
 * da foto do elenco) e o resultado é recalculado pelo placar. Tudo ou nada. Devolve o resultado.
 */
export async function corrigirPartida(
  db: DB,
  partidaId: number,
  correcao: { adicionar?: LanceNovo[]; removerLanceIds?: number[] },
): Promise<Resultado> {
  const adicionar = correcao.adicionar ?? [];
  const remover = [...new Set(correcao.removerLanceIds ?? [])];
  return db.transaction(async (tx) => {
    await travarEncerrada(tx, partidaId);
    return aplicarCorrecao(tx, partidaId, adicionar, remover);
  });
}

/**
 * A correção da tela "Corrigir": +1 põe um lance do jogador; −1 tira o mais recente dele daquele
 * tipo. Só em partida encerrada; o resultado é recalculado. Devolve o resultado.
 */
export async function corrigirContagem(
  db: DB,
  partidaId: number,
  jogadorId: number,
  tipo: TipoLance,
  delta: 1 | -1,
): Promise<Resultado> {
  return db.transaction(async (tx) => {
    await travarEncerrada(tx, partidaId);
    if (delta === 1) return aplicarCorrecao(tx, partidaId, [{ jogadorId, tipo }], []);
    const [maisRecente] = await tx
      .select({ id: lances.id })
      .from(lances)
      .where(and(eq(lances.partidaId, partidaId), eq(lances.jogadorId, jogadorId), eq(lances.tipo, tipo)))
      .orderBy(desc(lances.id))
      .limit(1);
    if (!maisRecente) throw new ErroPartida('lance_inexistente');
    return aplicarCorrecao(tx, partidaId, [], [maisRecente.id]);
  });
}

export type LanceDaPartida = { id: number; jogadorId: number; tipo: TipoLance };
export type JogadorNaPartida = { id: number; nome: string; gols: number; assistencias: number };
export type LadoAoVivo = { timeId: number; cor: Cor; jogadores: JogadorNaPartida[] };
export type PartidaAoVivo = {
  id: number;
  peladaId: number;
  iniciadaEm: Date;
  encerrada: boolean;
  resultado: Resultado | null;
  placar: Placar;
  /** Encerrada: o que faltava na hora do encerramento. */
  tempoRestanteMs: number;
  /** Só para partida em andamento. */
  sugerirEncerrar: null | 'tres_gols' | 'tempo';
  /**
   * Os lances em ordem (id crescente). O anotador refaz a conta com eles e os toques ainda em voo,
   * e o último é o que o Desfazer tira ("Desfazer: gol de Pepe", com o id como `esperadoId`).
   */
  lances: LanceDaPartida[];
  lados: Record<Lado, LadoAoVivo>;
};

/** Tudo o que o anotador mostra, numa chamada. Partida que não existe: null. */
export async function partidaAoVivo(db: DB, partidaId: number, now: Date): Promise<PartidaAoVivo | null> {
  const [p] = await db.select().from(partidas).where(eq(partidas.id, partidaId));
  if (!p) return null;
  const [cores, elenco, ls] = await Promise.all([
    db.select({ id: times.id, cor: times.cor }).from(times).where(inArray(times.id, [p.timeAId, p.timeBId])),
    db
      .select({ id: jogadores.id, nome: jogadores.nome, lado: partidaJogadores.lado })
      .from(partidaJogadores)
      .innerJoin(jogadores, eq(jogadores.id, partidaJogadores.jogadorId))
      .where(eq(partidaJogadores.partidaId, partidaId)),
    db
      .select({ id: lances.id, jogadorId: lances.jogadorId, tipo: lances.tipo })
      .from(lances)
      .where(eq(lances.partidaId, partidaId))
      .orderBy(asc(lances.id)),
  ]);

  const corDe = new Map(cores.map((t) => [t.id, t.cor]));
  const conta = (jogadorId: number, tipo: TipoLance) => ls.filter((l) => l.jogadorId === jogadorId && l.tipo === tipo).length;
  const lado = (l: Lado, timeId: number): LadoAoVivo => ({
    timeId,
    cor: corDe.get(timeId)!,
    jogadores: elenco
      .filter((j) => j.lado === l)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((j) => ({ id: j.id, nome: j.nome, gols: conta(j.id, 'gol'), assistencias: conta(j.id, 'assistencia') })),
  });
  const pl = placar(ls, new Map(elenco.map((j) => [j.id, j.lado])));
  const relogio = p.encerradaEm ?? now;

  return {
    id: p.id,
    peladaId: p.peladaId,
    iniciadaEm: p.iniciadaEm,
    encerrada: p.encerradaEm !== null,
    resultado: p.resultado,
    placar: pl,
    tempoRestanteMs: tempoRestanteMs(p.iniciadaEm, relogio),
    sugerirEncerrar: p.encerradaEm ? null : sugerirEncerrar(pl, p.iniciadaEm, now),
    lances: ls,
    lados: { A: lado('A', p.timeAId), B: lado('B', p.timeBId) },
  };
}

/** A partida rolando agora nesta pelada (id), ou null. */
export async function partidaEmAndamento(db: DB, peladaId: number): Promise<number | null> {
  const [p] = await db
    .select({ id: partidas.id })
    .from(partidas)
    .where(and(eq(partidas.peladaId, peladaId), isNull(partidas.encerradaEm)))
    .limit(1);
  return p?.id ?? null;
}

export type PartidaEsquecida = { id: number; data: string; corA: Cor; corB: Cor; placar: Placar };

/**
 * Partidas que ficaram abertas em outras peladas (ninguém encerrou na noite delas). A tela da
 * noite mostra essas para o admin abrir o anotador e encerrar; senão sumiriam e nunca contariam.
 * `peladaAtualId` null (não há pelada até hoje): todas as abertas.
 */
export async function partidasAbertasDeOutrasPeladas(db: DB, peladaAtualId: number | null): Promise<PartidaEsquecida[]> {
  const abertas = await db
    .select({ id: partidas.id, data: peladas.data, timeA: partidas.timeAId, timeB: partidas.timeBId })
    .from(partidas)
    .innerJoin(peladas, eq(peladas.id, partidas.peladaId))
    .where(and(isNull(partidas.encerradaEm), peladaAtualId === null ? undefined : ne(partidas.peladaId, peladaAtualId)))
    .orderBy(asc(peladas.data), asc(partidas.id));
  if (!abertas.length) return [];
  const ids = abertas.map((p) => p.id);
  const [cores, elenco, ls] = await Promise.all([
    db
      .select({ id: times.id, cor: times.cor })
      .from(times)
      .where(inArray(times.id, abertas.flatMap((p) => [p.timeA, p.timeB]))),
    db.select().from(partidaJogadores).where(inArray(partidaJogadores.partidaId, ids)),
    db
      .select({ partidaId: lances.partidaId, jogadorId: lances.jogadorId, tipo: lances.tipo })
      .from(lances)
      .where(inArray(lances.partidaId, ids)),
  ]);
  const corDe = new Map(cores.map((t) => [t.id, t.cor]));
  return abertas.map((p) => ({
    id: p.id,
    data: p.data,
    corA: corDe.get(p.timeA)!,
    corB: corDe.get(p.timeB)!,
    placar: placar(
      ls.filter((l) => l.partidaId === p.id),
      new Map(elenco.filter((j) => j.partidaId === p.id).map((j) => [j.jogadorId, j.lado])),
    ),
  }));
}

export type PartidaDoHistorico = {
  id: number;
  timeA: { id: number; cor: Cor };
  timeB: { id: number; cor: Cor };
  placar: Placar;
  resultado: Resultado;
  iniciadaEm: Date;
  encerradaEm: Date;
};

/** As partidas encerradas da pelada, na ordem em que foram jogadas, com placar, cores e resultado. */
export async function historicoDaPelada(db: DB, peladaId: number): Promise<PartidaDoHistorico[]> {
  const ps = await db
    .select()
    .from(partidas)
    .where(and(eq(partidas.peladaId, peladaId), isNotNull(partidas.encerradaEm)))
    .orderBy(asc(partidas.id));
  if (!ps.length) return [];
  const ids = ps.map((p) => p.id);
  const [cores, elenco, ls] = await Promise.all([
    db.select({ id: times.id, cor: times.cor }).from(times).where(eq(times.peladaId, peladaId)),
    db.select().from(partidaJogadores).where(inArray(partidaJogadores.partidaId, ids)),
    db
      .select({ partidaId: lances.partidaId, jogadorId: lances.jogadorId, tipo: lances.tipo })
      .from(lances)
      .where(inArray(lances.partidaId, ids)),
  ]);
  const corDe = new Map(cores.map((t) => [t.id, t.cor]));

  return ps.map((p) => {
    const lados = new Map(elenco.filter((j) => j.partidaId === p.id).map((j) => [j.jogadorId, j.lado]));
    return {
      id: p.id,
      timeA: { id: p.timeAId, cor: corDe.get(p.timeAId)! },
      timeB: { id: p.timeBId, cor: corDe.get(p.timeBId)! },
      placar: placar(
        ls.filter((l) => l.partidaId === p.id),
        lados,
      ),
      resultado: p.resultado!,
      iniciadaEm: p.iniciadaEm,
      encerradaEm: p.encerradaEm!,
    };
  });
}

/**
 * Os times da pelada na ordem da fila de espera: começa na ordem do sorteio e cada partida
 * encerrada aplica a regra (quem perde sai; empate, saem os dois). Os dois primeiros são a
 * próxima partida sugerida. A partida em andamento ainda não conta.
 */
export async function filaDeTimes(db: DB, peladaId: number): Promise<number[]> {
  const [ts, jogadas] = await Promise.all([
    db.select({ id: times.id }).from(times).where(eq(times.peladaId, peladaId)).orderBy(asc(times.ordem)),
    db
      .select({ timeA: partidas.timeAId, timeB: partidas.timeBId, resultado: partidas.resultado })
      .from(partidas)
      .where(and(eq(partidas.peladaId, peladaId), isNotNull(partidas.encerradaEm)))
      .orderBy(asc(partidas.id)),
  ]);
  return jogadas.reduce(
    (fila, p) => filaDepois(fila, { timeA: p.timeA, timeB: p.timeB, resultado: p.resultado! }),
    ts.map((t) => t.id),
  );
}
