'use client';

import { useState } from 'react';
import { SetaOrdem } from '@/components/icones';
import type { LinhaRankingComNota as LinhaRanking } from '@/domain/ranking';
import { ORDEM_PADRAO, ordenarLinhas, proximaOrdem, type Coluna, type Ordem } from './ordenar';

const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const umaCasa = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type Rolante = { coluna: Exclude<Coluna, 'posicao' | 'nome' | 'pontos'>; curto: string; nome: string; valor: (l: LinhaRanking) => string };

/** Colunas que rolam de lado, atrás das fixas (posição, nome, pontos). */
const ROLANTES: Rolante[] = [
  { coluna: 'jogos', curto: 'J', nome: 'jogos', valor: (l) => String(l.jogos) },
  { coluna: 'vitorias', curto: 'V', nome: 'vitórias', valor: (l) => String(l.vitorias) },
  { coluna: 'empates', curto: 'E', nome: 'empates', valor: (l) => String(l.empates) },
  { coluna: 'derrotas', curto: 'D', nome: 'derrotas', valor: (l) => String(l.derrotas) },
  { coluna: 'aproveitamento', curto: '%', nome: 'aproveitamento', valor: (l) => String(Math.round(l.aproveitamento)) },
  { coluna: 'gols', curto: 'G', nome: 'gols', valor: (l) => String(l.gols) },
  { coluna: 'assistencias', curto: 'A', nome: 'assistências', valor: (l) => String(l.assistencias) },
  { coluna: 'golsPorJogo', curto: 'G/J', nome: 'gols por jogo', valor: (l) => decimal.format(l.golsPorJogo) },
  { coluna: 'presencas', curto: 'Pres.', nome: 'presenças', valor: (l) => String(l.presencas) },
  { coluna: 'nota', curto: 'Nota', nome: 'nota', valor: (l) => umaCasa.format(l.nota) },
];

// Larguras das colunas fixas: cada uma gruda logo depois da anterior.
const FIXA_POS = 'sticky left-0 z-[1] w-[52px] min-w-[52px] pl-5 pr-1';
const FIXA_NOME = 'sticky left-[52px] z-[1] w-[128px] min-w-[128px] max-w-[128px] px-2';
const FIXA_PTS = 'sticky left-[180px] z-[1] w-[52px] min-w-[52px] px-1';

function Cabecalho({
  coluna,
  rotulo,
  nome,
  ordem,
  onOrdenar,
  className,
  alinhar = 'direita',
}: {
  coluna: Coluna;
  rotulo: string;
  nome: string;
  ordem: Ordem;
  onOrdenar: (c: Coluna) => void;
  className: string;
  alinhar?: 'direita' | 'esquerda' | 'centro';
}) {
  const ativa = ordem.coluna === coluna;
  // Sentido natural: posição e nome crescentes, números decrescentes.
  const crescente = (coluna === 'posicao' || coluna === 'nome') !== ordem.invertida;
  const justificar = alinhar === 'direita' ? 'justify-end' : alinhar === 'esquerda' ? 'justify-start' : 'justify-center';
  return (
    <th scope="col" aria-sort={ativa ? (crescente ? 'ascending' : 'descending') : undefined} className={`${className} p-0 font-normal`}>
      <button
        type="button"
        onClick={() => onOrdenar(coluna)}
        aria-label={`Ordenar por ${nome}`}
        className={`flex h-12 w-full items-center gap-0.5 ${justificar} text-sm transition-colors ${
          ativa ? 'font-semibold text-tinta' : 'text-meta hover:text-tinta'
        }`}
      >
        {rotulo}
        {ativa && <SetaOrdem paraCima={crescente} />}
      </button>
    </th>
  );
}

/**
 * Tabela do ranking: posição, nome e pontos ficam presos à esquerda; o resto rola de lado
 * dentro da tabela (a página nunca rola de lado). Tocar num cabeçalho reordena; de novo, inverte.
 */
export function TabelaRanking({ linhas, eu, periodo }: { linhas: LinhaRanking[]; eu: number; periodo: string }) {
  const [ordem, setOrdem] = useState<Ordem>(ORDEM_PADRAO);
  const ordenar = (c: Coluna) => setOrdem((o) => proximaOrdem(o, c));
  const linhasOrdenadas = ordenarLinhas(linhas, ordem);
  const props = { ordem, onOrdenar: ordenar };

  return (
    <div
      role="region"
      aria-label="Tabela do ranking (rola de lado)"
      tabIndex={0}
      className="-mx-5 mt-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] focus-visible:outline-offset-[-2px]"
    >
      <table className="w-max min-w-full border-separate border-spacing-0 text-base tabular-nums">
        <caption className="sr-only">Ranking: {periodo}</caption>
        <thead>
          <tr>
            <Cabecalho coluna="posicao" rotulo="#" nome="posição" alinhar="direita" className={`${FIXA_POS} bg-chao`} {...props} />
            <Cabecalho coluna="nome" rotulo="Nome" nome="nome" alinhar="esquerda" className={`${FIXA_NOME} bg-chao`} {...props} />
            <Cabecalho coluna="pontos" rotulo="Pts" nome="pontos" alinhar="centro" className={`${FIXA_PTS} rounded-t-placa bg-placa`} {...props} />
            {ROLANTES.map((c, i) => (
              <Cabecalho
                key={c.coluna}
                coluna={c.coluna}
                rotulo={c.curto}
                nome={c.nome}
                className={`min-w-11 pl-2 ${i === ROLANTES.length - 1 ? 'pr-5' : 'pr-2'}`}
                {...props}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {linhasOrdenadas.map(({ linha: l, posicao }, i) => {
            const minha = l.jogadorId === eu;
            const fundo = minha ? 'bg-placa-alta' : 'bg-chao';
            const ultima = i === linhasOrdenadas.length - 1;
            return (
              <tr key={l.jogadorId} aria-current={minha ? 'true' : undefined} className="h-12">
                <td className={`${FIXA_POS} ${fundo} text-right font-placa text-xl font-semibold text-meta`}>{posicao}</td>
                <th scope="row" className={`${FIXA_NOME} ${fundo} text-left font-medium`}>
                  <span className="block truncate">{l.nome}</span>
                  {minha && <span className="sr-only"> (você)</span>}
                </th>
                <td
                  className={`${FIXA_PTS} ${minha ? 'bg-placa-alta' : 'bg-placa'} ${ultima ? 'rounded-b-placa' : ''} text-center font-placa text-2xl font-semibold`}
                >
                  {l.pontos}
                </td>
                {ROLANTES.map((c, j) => (
                  <td key={c.coluna} className={`${fundo} pl-2 text-right text-apagado ${j === ROLANTES.length - 1 ? 'pr-5' : 'pr-2'}`}>
                    {c.valor(l)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
