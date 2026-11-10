'use client';

import { useState } from 'react';
import { SetaOrdem } from '@/components/icones';
import { useNoPc } from '@/components/so-no';
import type { LinhaRankingComNota as LinhaRanking } from '@/domain/ranking';
import { ORDEM_PADRAO, ordenarLinhas, proximaOrdem, type Coluna, type Ordem } from './ordenar';

const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const umaCasa = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

type Rolante = {
  coluna: Exclude<Coluna, 'posicao' | 'nome' | 'pontos'>;
  curto: string;
  nome: string;
  valor: (l: LinhaRanking) => string;
  /** Largura no PC quando o rótulo em 600 com a seta não cabe nos 56px de sempre. */
  largo?: boolean;
};

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
  { coluna: 'presencas', curto: 'Pres.', nome: 'presenças', valor: (l) => String(l.presencas), largo: true },
  { coluna: 'nota', curto: 'Nota', nome: 'nota', valor: (l) => umaCasa.format(l.nota), largo: true },
];

// Larguras das colunas fixas: cada uma gruda logo depois da anterior. No PC (≥1024px) nada rola nem gruda: a
// tabela tem largura fixa (`table-fixed`), os números 56px cada (Pres. e Nota 68px, para o rótulo em 600 caber com a
// seta), e o nome fica com o que sobra (truncado).
const FIXA_POS = 'sticky left-0 z-[1] w-[52px] min-w-[52px] pl-5 pr-1 lg:static lg:pl-3';
const FIXA_NOME = 'sticky left-[52px] z-[1] w-[128px] min-w-[128px] max-w-[128px] px-2 lg:static lg:w-auto lg:min-w-0 lg:max-w-none';
const FIXA_PTS = 'sticky left-[180px] z-[1] w-[52px] min-w-[52px] px-1 lg:static lg:w-16';
/** Respiro da última coluna: 20px até a borda da tela no celular, 12px no PC (como as linhas da lista). */
const ULTIMA = 'pr-5 lg:pr-3';

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
        {ativa && <SetaOrdem paraCima={crescente} className="size-3.5 shrink-0" />}
      </button>
    </th>
  );
}

/**
 * Tabela do ranking: posição, nome e pontos ficam presos à esquerda; o resto rola de lado
 * dentro da tabela (a página nunca rola de lado). Tocar num cabeçalho reordena; de novo, inverte.
 * No PC todas as colunas cabem e nada gruda nem rola.
 */
export function TabelaRanking({ linhas, eu, periodo }: { linhas: LinhaRanking[]; eu: number; periodo: string }) {
  const [ordem, setOrdem] = useState<Ordem>(ORDEM_PADRAO);
  const ordenar = (c: Coluna) => setOrdem((o) => proximaOrdem(o, c));
  const linhasOrdenadas = ordenarLinhas(linhas, ordem);
  const props = { ordem, onOrdenar: ordenar };
  // No PC a tabela cabe inteira: sem rolar, a região deixa de ser uma parada do Tab e de dizer "rola de lado".
  const noPc = useNoPc();

  return (
    <div
      role="region"
      aria-label={noPc ? 'Tabela do ranking' : 'Tabela do ranking (rola de lado)'}
      tabIndex={noPc ? undefined : 0}
      className="-mx-5 mt-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] focus-visible:outline-offset-[-2px] lg:-mx-3 lg:mt-6 lg:max-w-[60rem]"
    >
      <table className="w-max min-w-full border-separate border-spacing-0 text-base tabular-nums lg:w-full lg:table-fixed">
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
                className={`min-w-11 pl-2 ${i === ROLANTES.length - 1 ? ULTIMA : 'pr-2'} ${c.largo ? 'lg:w-[4.25rem]' : 'lg:w-14'}`}
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
                <td className={`${FIXA_POS} ${fundo} ${minha ? 'lg:rounded-l-placa' : ''} text-right font-placa text-xl font-semibold text-meta`}>
                  {posicao}
                </td>
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
                  <td
                    key={c.coluna}
                    className={`${fundo} pl-2 text-right text-apagado ${j === ROLANTES.length - 1 ? `${ULTIMA} ${minha ? 'lg:rounded-r-placa' : ''}` : 'pr-2'}`}
                  >
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
