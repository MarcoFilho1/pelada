import { desc, eq, inArray, lte } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { jogadores, partidas, peladas, presencas } from '@/db/schema';
import type { EstadoManual } from '@/domain/lista';
import { normalizarNome } from '@/domain/nome';
import { aberturaLista, dataDe, mesDaQuarta, proximaQuarta } from '@/domain/tempo';
import { ErroDeValidacao } from './erros';
import { mensalistasDoMes } from './mensalistas';

export type Pelada = { id: number; data: string; estadoManual: EstadoManual };

/** Por que uma ação na lista foi recusada. A mensagem vai para a tela; o `motivo` serve ao código. */
export type MotivoLista =
  | 'nao_esta_na_lista'
  | 'ja_na_lista'
  | 'lista_fechada'
  | 'lista_cancelada'
  | 'jogo_comecou'
  | 'jogador_inativo'
  | 'pelada_inexistente'
  | 'ja_tem_partida';

const MENSAGENS: Record<MotivoLista, string> = {
  nao_esta_na_lista: 'Só quem está na lista principal e ainda não confirmou pode confirmar.',
  ja_na_lista: 'Já está na lista.',
  lista_fechada: 'A lista está fechada.',
  lista_cancelada: 'A pelada desta semana foi cancelada.',
  jogo_comecou: 'A pelada já começou. Fale com o admin.',
  jogador_inativo: 'Esse jogador está desativado ou não existe.',
  pelada_inexistente: 'Essa pelada não existe mais. Recarregue a página.',
  ja_tem_partida: 'Já tem partida jogada nessa pelada; não dá pra cancelar.',
};

export class ErroLista extends ErroDeValidacao {
  constructor(public readonly motivo: MotivoLista) {
    super(MENSAGENS[motivo]);
    this.name = 'ErroLista';
  }
}

/**
 * A pelada da quarta desta semana (`proximaQuarta`), criada se ainda não existe. Ao criar, na
 * mesma transação, os mensalistas ativos do mês da quarta entram como M/pendente, com
 * `entrou_em` = abertura da lista e em ordem de nome (a ordem dos M fica estável).
 * Quem criou é quem insere as presenças: duas chamadas juntas não duplicam nada.
 */
export async function obterPeladaDaSemana(db: DB, now: Date): Promise<Pelada> {
  // Caminho comum (a lista recarrega a cada 5 s): já existe, só lê.
  const existente = await peladaExistenteDaSemana(db, now);
  if (existente) return existente;
  const data = proximaQuarta(now);
  return db.transaction(async (tx) => {
    const criada = await tx.insert(peladas).values({ data }).onConflictDoNothing({ target: peladas.data }).returning();
    const [pelada] = criada.length ? criada : await tx.select().from(peladas).where(eq(peladas.data, data));

    if (criada.length) {
      const ids = await mensalistasDoMes(tx, mesDaQuarta(data));
      if (ids.length) {
        const mensalistas = (
          await tx.select({ id: jogadores.id, nome: jogadores.nome }).from(jogadores).where(inArray(jogadores.id, ids))
        ).sort((a, b) => normalizarNome(a.nome).localeCompare(normalizarNome(b.nome), 'pt-BR'));
        const entrouEm = aberturaLista(data);
        // Um INSERT só: os ids seriais saem na ordem dos nomes e desempatam o mesmo `entrou_em`.
        await tx
          .insert(presencas)
          .values(mensalistas.map((m) => ({ peladaId: pelada.id, jogadorId: m.id, tipo: 'M' as const, status: 'pendente' as const, entrouEm })))
          .onConflictDoNothing();
      }
    }
    return { id: pelada.id, data: pelada.data, estadoManual: pelada.estadoManual };
  });
}

/** A pelada da semana só se já existe (não cria). */
export async function peladaExistenteDaSemana(db: DB, now: Date): Promise<Pelada | null> {
  const [p] = await db.select().from(peladas).where(eq(peladas.data, proximaQuarta(now)));
  return p ? { id: p.id, data: p.data, estadoManual: p.estadoManual } : null;
}

/**
 * A pelada da noite, para sorteio e partidas: a de hoje (Recife) ou, fora da quarta, a última
 * até hoje. Nunca uma futura. Na quarta, se a de hoje ainda não existe (ninguém abriu a lista),
 * cria por `obterPeladaDaSemana`, com os mensalistas, em vez de mostrar a da semana passada.
 * Depois das 22:30 não cria: aí `proximaQuarta` já é a semana seguinte.
 */
export async function peladaDoDia(db: DB, now: Date): Promise<Pelada | null> {
  const hoje = dataDe(now);
  const [p] = await db.select().from(peladas).where(lte(peladas.data, hoje)).orderBy(desc(peladas.data)).limit(1);
  if (p?.data !== hoje && proximaQuarta(now) === hoje) return obterPeladaDaSemana(db, now);
  return p ? { id: p.id, data: p.data, estadoManual: p.estadoManual } : null;
}

/**
 * Admin abre, fecha ou cancela a pelada à mão; `null` volta para o automático (segunda 00:00 até o
 * fim do jogo). Cancelar é recusado se a pelada já tem partida: as partidas contam no ranking.
 * A linha da pelada fica travada, como em `iniciarPartida`, para as duas coisas não se cruzarem.
 */
export async function definirEstadoManual(db: DB, peladaId: number, estado: EstadoManual): Promise<void> {
  await db.transaction(async (tx) => {
    const [p] = await tx.select({ id: peladas.id }).from(peladas).where(eq(peladas.id, peladaId)).for('update');
    if (!p) throw new ErroLista('pelada_inexistente');
    if (estado === 'cancelada') {
      const [partida] = await tx.select({ id: partidas.id }).from(partidas).where(eq(partidas.peladaId, peladaId)).limit(1);
      if (partida) throw new ErroLista('ja_tem_partida');
    }
    await tx.update(peladas).set({ estadoManual: estado }).where(eq(peladas.id, peladaId));
  });
}
