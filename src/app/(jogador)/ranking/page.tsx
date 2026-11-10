import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Fragment } from 'react';
import { FiltroPeriodo } from '@/components/filtro-periodo';
import { TelaJogador } from '@/components/topo';
import { getDb } from '@/db/client';
import { nomeDoPeriodo, periodoDaUrl } from '@/domain/periodo';
import { destaques, type LinhaRanking } from '@/domain/ranking';
import { periodosDisponiveis, rankingDoPeriodo } from '@/server/ranking';
import { lerSessaoJogador } from '@/server/sessao';
import { TabelaRanking } from './tabela-ranking';

export const metadata: Metadata = { title: 'Ranking · Pelada' };

const LEGENDA = [
  ['J', 'jogos'],
  ['V', 'vitórias'],
  ['E', 'empates'],
  ['D', 'derrotas'],
  ['%', 'aproveitamento'],
  ['G', 'gols'],
  ['A', 'assistências'],
  ['G/J', 'gols por jogo'],
  ['Pres.', 'quartas em que jogou'],
  ['Nota', 'a nota do sorteio (0 a 5)'],
];

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

type Cartao = { rotulo: string; linha: LinhaRanking; numero: number; unidade: string };

/** Os destaques do período numa placa só, uma linha por destaque. */
function Destaques({ cartoes, nome }: { cartoes: Cartao[]; nome: string }) {
  return (
    <section aria-label={`Destaques: ${nome}`} className="mt-6 lg:mt-5">
      <dl className="rounded-placa bg-placa px-4 py-1.5">
        {cartoes.map((c) => (
          <div key={c.rotulo} className="flex items-center gap-3 py-1.5">
            <div className="flex min-w-0 flex-1 flex-col-reverse">
              <dt className="text-sm text-apagado">{c.rotulo}</dt>
              <dd className="truncate text-linha font-medium">{c.linha.nome}</dd>
            </div>
            <dd className="flex shrink-0 items-baseline gap-1.5">
              <span className="font-placa text-subtitulo font-semibold tabular-nums">{c.numero}</span>
              <span className="w-14 text-sm text-meta">{c.unidade}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default async function RankingPage({ searchParams }: PageProps<'/ranking'>) {
  const db = getDb();
  const sessao = await lerSessaoJogador(db);
  if (!sessao) redirect('/entrar');
  if (sessao.precisaTrocar) redirect('/trocar-pin');

  const disp = await periodosDisponiveis(db);
  const periodo = periodoDaUrl((await searchParams).p, disp, new Date());
  const linhas = await rankingDoPeriodo(db, periodo);
  const d = destaques(linhas);
  const nome = nomeDoPeriodo(periodo);

  const cartoes: Cartao[] = [];
  if (d.artilheiro) cartoes.push({ rotulo: 'Artilheiro', linha: d.artilheiro, numero: d.artilheiro.gols, unidade: plural(d.artilheiro.gols, 'gol', 'gols') });
  if (d.garcom) cartoes.push({ rotulo: 'Garçom', linha: d.garcom, numero: d.garcom.assistencias, unidade: 'ast' });
  if (d.maisVitorias) {
    cartoes.push({ rotulo: 'Mais vitórias', linha: d.maisVitorias, numero: d.maisVitorias.vitorias, unidade: plural(d.maisVitorias.vitorias, 'vitória', 'vitórias') });
  }

  return (
    <TelaJogador pc>
      <main>
        <h1 className="mt-6 font-placa text-titulo font-semibold">Ranking</h1>
        {/* No PC, o filtro e os destaques lado a lado no alto (cada um com a largura do celular); a tabela inteira embaixo. */}
        <div className="lg:grid lg:grid-cols-[repeat(2,minmax(0,28rem))] lg:items-start lg:gap-x-10">
          <FiltroPeriodo base="/ranking" periodo={periodo} disp={disp} />
          {linhas.length > 0 && cartoes.length > 0 && <Destaques cartoes={cartoes} nome={nome} />}
        </div>

        {linhas.length === 0 ? (
          <div className="mt-6 rounded-placa bg-placa p-5">
            <p className="text-linha font-medium">
              {disp.meses.length === 0 ? 'Nenhuma partida encerrada ainda.' : 'Ninguém no ranking neste período.'}
            </p>
            <p className="mt-2 text-base text-apagado">O ranking sai das partidas que o admin encerra no anotador.</p>
          </div>
        ) : (
          <>
            <p className="mt-6 text-sm text-meta lg:hidden">Arraste para o lado para ver mais colunas.</p>
            <TabelaRanking linhas={linhas} eu={sessao.jogadorId} periodo={nome} />

            <p className="mt-4 text-sm leading-6 text-meta lg:max-w-3xl">
              {LEGENDA.map(([curto, longo], i) => (
                <Fragment key={curto}>
                  {i > 0 && ' · '}
                  <span className="whitespace-nowrap">
                    <span className="font-semibold text-apagado">{curto}</span> {longo}
                  </span>
                </Fragment>
              ))}
              . <span className="lg:hidden">Toque</span>
              <span className="hidden lg:inline">Clique</span> num título para ordenar.
            </p>
          </>
        )}
      </main>
    </TelaJogador>
  );
}
