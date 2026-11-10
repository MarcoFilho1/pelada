import { desc, inArray, lte } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { jogadores, peladas } from '@/db/schema';
import { nomeDoPeriodo, periodoDaUrl } from '@/domain/periodo';
import { dataDe, mesDe } from '@/domain/tempo';
import { previaMensalistasDoMes } from '@/server/mensalistas';
import { historicoDaPelada } from '@/server/partidas';
import { estadoDaSemanaSemCriar } from '@/server/presencas';
import { periodosDisponiveis, rankingDoPeriodo } from '@/server/ranking';
import { timesDaPelada } from '@/server/times';

export type Ferramenta = {
  nome: string;
  descricao: string;
  /** JSON Schema dos argumentos. */
  parametros: object;
  executar(args: unknown): Promise<unknown>;
};

const TOPO = 20;

const semParametros = { type: 'object', properties: {}, additionalProperties: false };
const comPeriodo = {
  type: 'object',
  properties: {
    periodo: {
      type: 'string',
      description: "'geral', um ano ('2026') ou um mês ('2026-11'). Omitido: o mês atual, ou o geral se ele não teve partidas.",
    },
  },
  additionalProperties: false,
};

function lerPeriodo(args: unknown): string | undefined {
  if (args == null) return undefined;
  if (typeof args !== 'object' || Array.isArray(args)) throw new Error('argumentos inválidos');
  const p = (args as { periodo?: unknown }).periodo;
  if (p === undefined || p === null) return undefined;
  if (typeof p !== 'string') throw new Error('periodo inválido');
  return p;
}

/** Só leitura (nunca cria pelada): a pelada de hoje ou, fora da quarta, a última até hoje. */
async function peladaDaNoite(db: DB, agora: Date): Promise<{ id: number; data: string } | null> {
  const [p] = await db
    .select({ id: peladas.id, data: peladas.data })
    .from(peladas)
    .where(lte(peladas.data, dataDe(agora)))
    .orderBy(desc(peladas.data))
    .limit(1);
  return p ?? null;
}

export function ferramentasDeLeitura(db: DB, agora: () => Date): Ferramenta[] {
  const ranking = async (periodoTxt: string | undefined) => {
    const disp = await periodosDisponiveis(db);
    const periodo = periodoDaUrl(periodoTxt, disp, agora());
    return { periodo: nomeDoPeriodo(periodo), linhas: await rankingDoPeriodo(db, periodo) };
  };

  return [
    {
      nome: 'lista_da_semana',
      descricao: 'A lista de presença da próxima pelada (quarta): quem está na lista, quem confirmou, a fila e as vagas.',
      parametros: semParametros,
      async executar() {
        const e = await estadoDaSemanaSemCriar(db, agora());
        const nomes = (l: typeof e.principal) => l.map((i) => ({ nome: i.nome, tipo: i.tipo, confirmado: i.confirmado }));
        return {
          data: e.data,
          aberta: e.aberta,
          cancelada: e.cancelada,
          vagas: e.vagas,
          lista: nomes(e.principal),
          fila: nomes(e.fila),
          foraDoPrazo: e.foraDoPrazo.map((i) => i.nome),
        };
      },
    },
    {
      nome: 'mensalistas_do_mes',
      descricao: 'Os mensalistas do mês atual.',
      parametros: semParametros,
      async executar() {
        const mes = mesDe(agora());
        const { ids, copiado } = await previaMensalistasDoMes(db, mes);
        const linhas = ids.length ? await db.select({ nome: jogadores.nome }).from(jogadores).where(inArray(jogadores.id, ids)) : [];
        return { mes, aindaNaoDefinidos: copiado, mensalistas: linhas.map((l) => l.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')) };
      },
    },
    {
      nome: 'ranking',
      descricao: `Ranking de jogadores (pontos, jogos, vitórias, gols, assistências, aproveitamento) no período. Mostra os ${TOPO} primeiros.`,
      parametros: comPeriodo,
      async executar(args) {
        const { periodo, linhas } = await ranking(lerPeriodo(args));
        return {
          periodo,
          total: linhas.length,
          jogadores: linhas.slice(0, TOPO).map((l, i) => ({
            posicao: i + 1,
            nome: l.nome,
            pontos: l.pontos,
            jogos: l.jogos,
            vitorias: l.vitorias,
            empates: l.empates,
            derrotas: l.derrotas,
            gols: l.gols,
            assistencias: l.assistencias,
            aproveitamento: l.aproveitamento,
          })),
        };
      },
    },
    {
      nome: 'artilharia',
      descricao: `Artilharia: quem fez mais gols (e assistências) no período. Mostra os ${TOPO} primeiros.`,
      parametros: comPeriodo,
      async executar(args) {
        const { periodo, linhas } = await ranking(lerPeriodo(args));
        const artilheiros = linhas
          .filter((l) => l.gols > 0)
          .sort((a, b) => b.gols - a.gols || b.assistencias - a.assistencias || a.nome.localeCompare(b.nome, 'pt-BR'))
          .slice(0, TOPO)
          .map((l, i) => ({ posicao: i + 1, nome: l.nome, gols: l.gols, assistencias: l.assistencias, jogos: l.jogos }));
        return { periodo, artilheiros };
      },
    },
    {
      nome: 'partidas_da_noite',
      descricao: 'As partidas já encerradas da pelada da noite (ou da última pelada): cores dos times, placar e resultado. Se ehHoje for false, a pelada de hoje ainda não existe e os dados são de data.',
      parametros: semParametros,
      async executar() {
        const p = await peladaDaNoite(db, agora());
        if (!p) return { data: null, ehHoje: false, partidas: [] };
        const historico = await historicoDaPelada(db, p.id);
        return {
          data: p.data,
          ehHoje: p.data === dataDe(agora()),
          partidas: historico.map((h, i) => ({
            numero: i + 1,
            timeA: h.timeA.cor,
            timeB: h.timeB.cor,
            placarA: h.placar.A,
            placarB: h.placar.B,
            resultado: h.resultado,
          })),
        };
      },
    },
    {
      nome: 'times_da_noite',
      descricao: 'Os times sorteados da pelada da noite (ou da última pelada): cor e jogadores de cada time. Se ehHoje for false, o sorteio de hoje ainda não existe e os dados são de data.',
      parametros: semParametros,
      async executar() {
        const p = await peladaDaNoite(db, agora());
        if (!p) return { data: null, ehHoje: false, times: [] };
        const ts = await timesDaPelada(db, p.id);
        return { data: p.data, ehHoje: p.data === dataDe(agora()), times: ts.map((t) => ({ cor: t.cor, jogadores: t.jogadores.map((j) => j.nome) })) };
      },
    },
  ];
}
