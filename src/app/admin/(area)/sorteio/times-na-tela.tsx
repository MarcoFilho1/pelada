'use client';

// As peças da tela de sorteio que servem às duas larguras: a diferença, os cartões dos times, a barra de
// baixo do celular e o que no PC fica ao lado dos times (DESIGN.md › Sorteio e › No PC).

import { useSyncExternalStore, type ReactNode } from 'react';
import { Colete, NOME_DA_COR } from '@/components/colete';
import { Mais } from '@/components/icones';
import { CORES, formatarNota, rotuloDaDiferenca, type Cor, type JogadorNota, type TimeSorteado } from '@/domain/sorteio';

/** Vagas por time: o sorteio completa até aqui com COMPLETE. */
export const VAGAS = 4;

/** Um COMPLETE no cartão: `chave` é o id salvo (definitivo) ou um número local (proposta). */
export type CompleteNaTela = { chave: number; nota: number };
export type TimeNaTela = { jogadores: JogadorNota[]; completes: CompleteNaTela[] };
export type CompleteEscolhido = { time: number; chave: number };

export const somar = (t: TimeNaTela) => t.jogadores.reduce((s, j) => s + j.nota, 0) + t.completes.reduce((s, c) => s + c.nota, 0);
export const paraSorteado = (t: TimeNaTela): TimeSorteado => ({ jogadores: t.jogadores, completes: t.completes.map((c) => c.nota), soma: somar(t) });
const vagas = (t: TimeNaTela) => t.jogadores.length + t.completes.length;

// ---- Duas larguras -------------------------------------------------------------------------

const PC = '(min-width: 64rem)'; // o `lg` do Tailwind

function assinar(aviso: () => void) {
  const m = window.matchMedia(PC);
  m.addEventListener('change', aviso);
  return () => m.removeEventListener('change', aviso);
}

/** true no PC (≥1024px), false no celular, null antes de hidratar (o servidor não sabe a largura). */
function useNoPc() {
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(PC).matches,
    () => null,
  );
}

/**
 * Um pedaço que tem um lugar no celular e outro no PC (a barra de baixo × o lado dos times), com o mesmo
 * estado de quem chama. Antes de hidratar as duas cópias vão no HTML e o CSS de quem chama esconde a da outra
 * largura; depois só fica a da largura atual: nada de texto, id ou leitor de tela em dobro. Girar o tablet
 * troca a cópia sem perder nada, porque o estado mora em quem chama.
 */
export function SoNo({ pc, children }: { pc: boolean; children: ReactNode }) {
  const noPc = useNoPc();
  return noPc === null || noPc === pc ? children : null;
}

// ---- Peças ---------------------------------------------------------------------------------

/**
 * A diferença de força dita com todas as letras (soma, ou média por jogador se os tamanhos diferem), o que dá para fazer
 * nos cartões e, à direita, uma ação de texto opcional.
 */
export function Equilibrio({
  times,
  dica,
  acao,
  acaoPc,
}: {
  times: TimeSorteado[];
  dica: string;
  acao?: ReactNode;
  /** Só no PC: as pílulas do sorteio na mesma linha, à direita (descem se não couberem). */
  acaoPc?: ReactNode;
}) {
  return (
    <div className="mt-5 lg:mt-0">
      <div className="flex items-center justify-between gap-3 lg:flex-wrap lg:items-start lg:gap-x-6 lg:gap-y-3">
        {/* Com as pílulas ao lado, a diferença fica no meio da altura delas (56px), também quando a confirmação cresce. */}
        <p className={`font-placa text-subtitulo font-semibold tabular-nums ${acaoPc ? 'lg:flex lg:min-h-14 lg:items-center' : ''}`}>
          {rotuloDaDiferenca(times)}
        </p>
        {acao}
        {acaoPc && (
          <SoNo pc>
            <div className="hidden lg:block">{acaoPc}</div>
          </SoNo>
        )}
      </div>
      {/* O gesto: "Toque…" no celular, "Clique…" no PC (uma frase inteira por largura). */}
      <p className="mt-1 text-base text-meta lg:hidden">{dica}</p>
      <p className="mt-1 hidden text-base text-meta lg:block">{dica.replace(/^Toque/, 'Clique')}</p>
    </div>
  );
}

/**
 * Os cartões dos times. O COMPLETE é uma vaga: um buraco na placa (fundo do chão), com a nota que
 * conta na soma. Time com menos de 4 ganha "COMPLETE" com um mais, para pôr uma vaga. No PC os cartões
 * ficam lado a lado quando a coluna tem largura para quatro (`@container` de quem chama).
 */
export function GradeDeTimes({
  times,
  cores = CORES.slice(0, times.length),
  selecionado,
  completeAberto,
  animados,
  onToque,
  onToqueComplete,
  onPorComplete,
}: {
  times: TimeNaTela[];
  cores?: readonly Cor[];
  selecionado: number | null;
  completeAberto: CompleteEscolhido | null;
  animados?: { ids: number[]; n: number };
  onToque: (time: number, j: JogadorNota) => void;
  onToqueComplete: (time: number, chave: number) => void;
  onPorComplete: (time: number) => void;
}) {
  return (
    <section aria-label="Times" className="mt-4">
      <div className="grid grid-cols-2 gap-2 @[42rem]:grid-cols-4">
        {times.map((t, i) => {
          const cor = cores[i];
          const nome = NOME_DA_COR[cor];
          const idTitulo = `time-${cor}`;
          return (
            <section key={cor} aria-labelledby={idTitulo} className="flex flex-col rounded-placa bg-placa p-1.5">
              <div className="flex h-12 items-center gap-2 px-2">
                <Colete cor={cor} />
                <h3 id={idTitulo} className="min-w-0 flex-1 truncate text-base font-semibold">
                  {nome}
                </h3>
                <span className="font-placa text-subtitulo leading-none font-semibold tabular-nums">
                  <span className="sr-only">soma </span>
                  {formatarNota(somar(t))}
                </span>
              </div>
              {vagas(t) === 0 && <p className="px-2 pb-3 text-base text-meta">Ninguém.</p>}
              <ul className="flex flex-col">
                {t.jogadores.map((j) => {
                  const marcado = selecionado === j.id;
                  const animar = animados?.ids.includes(j.id);
                  return (
                    <li key={animar ? `${j.id}-${animados!.n}` : j.id}>
                      <button
                        type="button"
                        aria-pressed={marcado}
                        onClick={() => onToque(i, j)}
                        className={`flex h-12 w-full items-center gap-2 rounded-placa px-2 text-left transition-colors ${
                          marcado ? 'bg-placa-alta ring-2 ring-lima ring-inset' : 'hover:bg-placa-alta/60 active:bg-placa-alta'
                        } ${animar ? 'animate-pendurar' : ''}`}
                      >
                        <span className="min-w-0 flex-1 truncate text-base font-medium text-tinta">{j.nome}</span>
                        <span className="shrink-0 text-base text-meta tabular-nums">
                          <span className="sr-only">nota </span>
                          {formatarNota(j.nota)}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {t.completes.map((c) => {
                  const aberto = completeAberto?.chave === c.chave;
                  return (
                    <li key={`c${c.chave}`} className="animate-pendurar pt-1">
                      <button
                        type="button"
                        aria-pressed={aberto}
                        aria-label={`COMPLETE do ${nome}, nota ${formatarNota(c.nota)}`}
                        onClick={() => onToqueComplete(i, c.chave)}
                        className={`flex h-12 w-full items-center gap-2 rounded-placa px-2 text-left transition-colors ${
                          aberto ? 'bg-placa-alta ring-2 ring-lima ring-inset' : 'bg-chao hover:bg-placa-alta/60 active:bg-placa-alta'
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate text-base font-medium text-apagado">COMPLETE</span>
                        <span className="shrink-0 text-base text-meta tabular-nums">{formatarNota(c.nota)}</span>
                      </button>
                    </li>
                  );
                })}
                {vagas(t) > 0 && vagas(t) < VAGAS && (
                  <li>
                    <button
                      type="button"
                      aria-label={`Pôr um COMPLETE no ${nome}`}
                      onClick={() => onPorComplete(i)}
                      className="flex h-12 w-full items-center gap-2 rounded-placa px-2 text-left text-base font-medium text-meta transition-colors hover:bg-placa-alta/60 hover:text-tinta active:bg-placa-alta"
                    >
                      <Mais className="size-5 shrink-0" />
                      COMPLETE
                    </button>
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Barra de baixo do celular, presa no rodapé da tela: as ações ficam no alcance do polegar. `folha` = a
 * pergunta de um jogador ou COMPLETE escolhido: sobe em placa com sombra, porque flutua sobre os times.
 * No PC não existe: as ações ficam acima dos times e a folha vira o Painel ao lado.
 */
export function Barra({ children, folha = false }: { children: ReactNode; folha?: boolean }) {
  return (
    <div
      className={`sticky bottom-0 mt-auto lg:hidden ${
        folha ? '-mx-3 rounded-t-cartao bg-placa px-4 pt-3 pb-4 shadow-[0_-12px_32px_rgba(0,0,0,0.7)]' : '-mx-5 bg-chao px-5 pt-3 pb-4'
      }`}
    >
      {children}
    </div>
  );
}

/**
 * No PC, a folha do celular vira este painel na coluna da esquerda, ao lado dos times (nunca por cima deles):
 * placa #111 parada, sem sombra, presa no alto enquanto a página rola.
 */
export function PainelAoLado({ children }: { children: ReactNode }) {
  return <div className="hidden rounded-placa bg-placa p-4 lg:sticky lg:top-6 lg:block">{children}</div>;
}
