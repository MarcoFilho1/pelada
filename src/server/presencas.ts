import { and, eq } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { jogadores, mensalistasMes, peladas, presencas } from '@/db/schema';
import {
  calcularLista,
  podeConfirmar,
  travaDoJogador,
  travaParaSair,
  type EstadoLista,
  type EstadoManual,
  type ItemLista,
  type Presenca,
} from '@/domain/lista';
import { aberturaLista, mesDaQuarta, prazoMensalista, proximaQuarta } from '@/domain/tempo';
import { ErroLista, obterPeladaDaSemana, peladaExistenteDaSemana, type Pelada } from './pelada';

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];

export type EstadoDaSemana = EstadoLista & {
  /** `null` antes de segunda 00:00, enquanto ninguém (nem o admin) criou a pelada da semana. */
  peladaId: number | null;
  data: string;
  estadoManual: EstadoManual;
  /** Mensalistas que não confirmaram até quarta 14h e perderam a vaga. */
  foraDoPrazo: ItemLista[];
};

/** Presenças da pelada, só de jogadores ativos (quem parou de vir some das listas). */
async function lerPresencas(db: DB | Tx, peladaId: number, travar: boolean): Promise<Presenca[]> {
  const consulta = db
    .select({
      id: presencas.id,
      jogadorId: presencas.jogadorId,
      nome: jogadores.nome,
      tipo: presencas.tipo,
      status: presencas.status,
      entrouEm: presencas.entrouEm,
    })
    .from(presencas)
    .innerJoin(jogadores, eq(jogadores.id, presencas.jogadorId))
    .where(and(eq(presencas.peladaId, peladaId), eq(jogadores.ativo, true)));
  return travar ? consulta.for('update', { of: presencas }) : consulta;
}

function perdeuPrazo(p: Presenca, data: string, now: Date): boolean {
  return p.tipo === 'M' && p.status === 'pendente' && now >= prazoMensalista(data);
}

/** Está na lista ou na fila (não saiu e não perdeu o prazo). */
function estaNaLista(p: Presenca | undefined, data: string, now: Date): boolean {
  return !!p && p.status !== 'removido' && !perdeuPrazo(p, data, now);
}

function montar(pelada: Pelada, ps: Presenca[], now: Date): EstadoDaSemana {
  const estado = calcularLista({ presencas: ps, dataQuarta: pelada.data, estadoManual: pelada.estadoManual, now });
  const foraDoPrazo = ps
    .filter((p) => perdeuPrazo(p, pelada.data, now))
    .sort((a, b) => a.entrouEm.getTime() - b.entrouEm.getTime() || a.id - b.id)
    .map((p) => ({ jogadorId: p.jogadorId, nome: p.nome, tipo: p.tipo, confirmado: false }));
  return { ...estado, peladaId: pelada.id, data: pelada.data, estadoManual: pelada.estadoManual, foraDoPrazo };
}

/**
 * A lista da semana como os jogadores veem. A partir de segunda 00:00 cria a pelada (e as
 * presenças dos mensalistas) se preciso; antes disso só lê, para que mensalistas salvos até a
 * abertura ainda valham para esta quarta.
 */
export async function estadoDaSemana(db: DB, now: Date): Promise<EstadoDaSemana> {
  const data = proximaQuarta(now);
  const pelada = now >= aberturaLista(data) ? await obterPeladaDaSemana(db, now) : await peladaExistenteDaSemana(db, now);
  if (!pelada) return { ...montar({ id: 0, data, estadoManual: null }, [], now), peladaId: null };
  return montar(pelada, await lerPresencas(db, pelada.id, false), now);
}

/**
 * A lista de uma pelada qualquer (pelo id), com as mesmas regras da lista da semana: só
 * jogadores ativos, prazo dos mensalistas e limite de vagas. Só lê.
 */
export async function estadoDaPelada(db: DB, peladaId: number, now: Date): Promise<EstadoDaSemana> {
  const [p] = await db.select().from(peladas).where(eq(peladas.id, peladaId));
  if (!p) throw new ErroLista('pelada_inexistente');
  return montar({ id: p.id, data: p.data, estadoManual: p.estadoManual }, await lerPresencas(db, p.id, false), now);
}

type Contexto = { tx: Tx; pelada: Pelada; ps: Presenca[]; estado: EstadoDaSemana; minha: Presenca | undefined };

/**
 * Toda mudança na lista passa aqui: uma transação que trava a linha da pelada (as mudanças da
 * mesma pelada andam uma de cada vez, inclusive as que inserem presença nova) e as presenças
 * lidas, e calcula o estado em cima do que está travado.
 */
async function mudarLista<T>(
  db: DB,
  peladaId: number,
  jogadorId: number,
  now: Date,
  fn: (c: Contexto) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const [p] = await tx.select().from(peladas).where(eq(peladas.id, peladaId)).for('update');
    if (!p) throw new ErroLista('pelada_inexistente');
    const pelada = { id: p.id, data: p.data, estadoManual: p.estadoManual };
    const ps = await lerPresencas(tx, peladaId, true);
    return fn({ tx, pelada, ps, estado: montar(pelada, ps, now), minha: ps.find((x) => x.jogadorId === jogadorId) });
  });
}

function exigirListaDoJogador({ pelada, estado }: Contexto, now: Date) {
  const trava = travaDoJogador(estado, pelada.data, pelada.estadoManual, now);
  if (trava === 'cancelada') throw new ErroLista('lista_cancelada');
  if (trava === 'fechada') throw new ErroLista('lista_fechada');
  if (trava === 'comecou') throw new ErroLista('jogo_comecou');
}

/** Pelada em que o jogador mexe agora; antes da abertura, sem pelada criada, a lista está fechada. */
async function peladaDoJogador(db: DB, now: Date): Promise<Pelada> {
  if (now >= aberturaLista(proximaQuarta(now))) return obterPeladaDaSemana(db, now);
  const existente = await peladaExistenteDaSemana(db, now);
  if (!existente) throw new ErroLista('lista_fechada');
  return existente;
}

async function marcarStatus(tx: Tx, peladaId: number, jogadorId: number, status: 'confirmado' | 'removido', now: Date) {
  await tx
    .update(presencas)
    .set({ status, atualizadoEm: now })
    .where(and(eq(presencas.peladaId, peladaId), eq(presencas.jogadorId, jogadorId)));
}

/** (Re)põe o jogador na lista com `entrou_em = now`: vai pro fim. Linha que já existe é reaproveitada. */
async function porNaLista(tx: Tx, peladaId: number, jogadorId: number, tipo: 'M' | 'D', now: Date) {
  const valores = { tipo, status: 'pendente' as const, entrouEm: now, atualizadoEm: now };
  await tx
    .insert(presencas)
    .values({ peladaId, jogadorId, ...valores })
    .onConflictDoUpdate({ target: [presencas.peladaId, presencas.jogadorId], set: valores });
}

// ---- Jogador (a própria presença) -----------------------------------------------

/** Confirma a própria presença. Só quem está na lista principal e ainda não confirmou. */
export async function confirmar(db: DB, jogadorId: number, now: Date): Promise<void> {
  const pelada = await peladaDoJogador(db, now);
  await mudarLista(db, pelada.id, jogadorId, now, async (c) => {
    exigirListaDoJogador(c, now);
    if (!podeConfirmar(c.estado, jogadorId)) throw new ErroLista('nao_esta_na_lista');
    await marcarStatus(c.tx, pelada.id, jogadorId, 'confirmado', now);
  });
}

/**
 * Sai da lista ou da fila (mensalista ou diarista), até a hora do jogo, mesmo com a lista fechada.
 * Só a pelada cancelada ou o jogo começado impedem. Sem presença: não faz nada.
 */
export async function remover(db: DB, jogadorId: number, now: Date): Promise<void> {
  const pelada = await peladaDoJogador(db, now);
  await mudarLista(db, pelada.id, jogadorId, now, async (c) => {
    const trava = travaParaSair(c.estado, pelada.data, pelada.estadoManual, now);
    if (trava === 'cancelada') throw new ErroLista('lista_cancelada');
    if (trava === 'comecou') throw new ErroLista('jogo_comecou');
    if (c.minha && c.minha.status !== 'removido') await marcarStatus(c.tx, pelada.id, jogadorId, 'removido', now);
  });
}

/**
 * Entra no fim da fila como diarista. Quem saiu, ou o mensalista que perdeu o prazo, volta na
 * mesma linha, agora como D e com `entrou_em = now`.
 */
export async function entrarNaFila(db: DB, jogadorId: number, now: Date): Promise<void> {
  const pelada = await peladaDoJogador(db, now);
  await mudarLista(db, pelada.id, jogadorId, now, async (c) => {
    exigirListaDoJogador(c, now);
    if (estaNaLista(c.minha, pelada.data, now)) throw new ErroLista('ja_na_lista');
    await porNaLista(c.tx, pelada.id, jogadorId, 'D', now);
  });
}

// ---- Admin (qualquer jogador, com a lista em qualquer estado) ---------------------

/**
 * Põe um jogador ativo na lista, por padrão como D no fim da fila (ou direto na lista, se houver
 * vaga). Quem já teve presença nesta pelada (saiu, perdeu o prazo) volta sempre como D: "se voltar,
 * entra no fim da fila". Só o mensalista do mês sem presença nenhuma (marcado depois que a pelada
 * existia), antes do prazo, entra como M; e nem assim se não couber na lista principal ou se, como
 * M, tiraria da lista um diarista que já confirmou.
 */
export async function adminAdicionar(db: DB, peladaId: number, jogadorId: number, now: Date): Promise<void> {
  await mudarLista(db, peladaId, jogadorId, now, async ({ tx, pelada, ps, estado, minha }) => {
    const [j] = await tx
      .select({ id: jogadores.id })
      .from(jogadores)
      .where(and(eq(jogadores.id, jogadorId), eq(jogadores.ativo, true)));
    if (!j) throw new ErroLista('jogador_inativo');
    if (estaNaLista(minha, pelada.data, now)) throw new ErroLista('ja_na_lista');
    let tipo: 'M' | 'D' = 'D';
    if (!minha && now < prazoMensalista(pelada.data)) {
      const [mensalista] = await tx
        .select({ id: mensalistasMes.jogadorId })
        .from(mensalistasMes)
        .where(and(eq(mensalistasMes.mes, mesDaQuarta(pelada.data)), eq(mensalistasMes.jogadorId, jogadorId)));
      if (mensalista && cabeComoM(pelada, ps, estado, jogadorId, now)) tipo = 'M';
    }
    await porNaLista(tx, peladaId, jogadorId, tipo, now);
  });
}

/**
 * Entrar como M só vale se, como M, ele cai na lista principal (com 16 M já listados cairia além
 * das vagas) e sem empurrar para a fila nenhum diarista que já confirmou.
 */
function cabeComoM(pelada: Pelada, ps: Presenca[], estado: EstadoLista, jogadorId: number, now: Date): boolean {
  const novo: Presenca = { id: Number.MAX_SAFE_INTEGER, jogadorId, nome: '', tipo: 'M', status: 'pendente', entrouEm: now };
  const depois = calcularLista({ presencas: [...ps, novo], dataQuarta: pelada.data, estadoManual: pelada.estadoManual, now });
  const ficam = new Set(depois.principal.map((i) => i.jogadorId));
  if (!ficam.has(jogadorId)) return false;
  return !estado.principal.some((i) => i.tipo === 'D' && i.confirmado && !ficam.has(i.jogadorId));
}

/** Confirma por alguém que está na lista principal (mesmo com a lista fechada). */
export async function adminConfirmar(db: DB, peladaId: number, jogadorId: number, now: Date = new Date()): Promise<void> {
  await mudarLista(db, peladaId, jogadorId, now, async ({ tx, estado }) => {
    if (!podeConfirmar(estado, jogadorId)) throw new ErroLista('nao_esta_na_lista');
    await marcarStatus(tx, peladaId, jogadorId, 'confirmado', now);
  });
}

/** Tira alguém da lista ou da fila. Sem presença: não faz nada. */
export async function adminRemover(db: DB, peladaId: number, jogadorId: number, now: Date = new Date()): Promise<void> {
  await mudarLista(db, peladaId, jogadorId, now, async ({ tx, minha }) => {
    if (minha && minha.status !== 'removido') await marcarStatus(tx, peladaId, jogadorId, 'removido', now);
  });
}
