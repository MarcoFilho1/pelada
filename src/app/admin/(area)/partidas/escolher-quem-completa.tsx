'use client';

// Antes de iniciar uma partida com COMPLETE: um passo "Quem completa o Azul?" por vaga e, no fim, a
// conferência com a pílula de iniciar. Quem completa vale só para esta partida.

import { Colete, NOME_DA_COR } from '@/components/colete';
import { Mais } from '@/components/icones';
import { PILULA, PILULA_SEGUNDA, TEXTO } from '@/components/pilula';
import { formatarNota, type Cor, type JogadorNota } from '@/domain/sorteio';
import { BuscaDeJogador, Erro } from '../sorteio/busca-de-jogador';
import type { Resposta } from './quem-completa';

const LINHA_TOCAVEL =
  '-mx-4 flex h-toque w-[calc(100%+2rem)] items-center gap-3 rounded-placa px-4 text-left transition-colors hover:bg-placa active:bg-placa-alta disabled:hover:bg-transparent';

/** Um passo: quem completa uma vaga de COMPLETE. Primeiro os dos outros times, depois a busca, e "Jogar sem". */
export function QuemCompleta({
  cor,
  nota,
  jaCompleta,
  jogaSemCom,
  deFora,
  corDe,
  todos,
  jaEstao,
  onEscolher,
  onCadastrado,
  onJogarSem,
  onVoltar,
}: {
  cor: Cor;
  /** Nota do COMPLETE: a referência de nível para escolher. */
  nota: number;
  /** Quem já completa outra vaga deste time nesta partida. */
  jaCompleta: string[];
  /** Quantos o time fica se esta vaga for "Jogar sem". */
  jogaSemCom: number;
  /** Jogadores dos outros times da noite, ainda livres. */
  deFora: JogadorNota[];
  corDe: (jogadorId: number) => Cor | undefined;
  /** Todos os ativos que a busca conhece (os de times aparecem como "Já está no jogo"). */
  todos: JogadorNota[];
  jaEstao: Set<number>;
  onEscolher: (j: JogadorNota) => void;
  onCadastrado: (j: JogadorNota) => void;
  onJogarSem: () => void;
  onVoltar: () => void;
}) {
  const time = NOME_DA_COR[cor];
  return (
    <section aria-labelledby="titulo-quem-completa" className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="titulo-quem-completa" className="flex min-w-0 items-center gap-2 font-placa text-2xl font-semibold">
          <Colete cor={cor} />
          Quem completa o {time}?
        </h2>
        <button type="button" className={`-mr-3 shrink-0 ${TEXTO}`} onClick={onVoltar}>
          Voltar
        </button>
      </div>
      <p className="mt-1 text-base text-apagado">
        {jaCompleta.length > 0 && `${jaCompleta.join(' e ')} já ${jaCompleta.length === 1 ? 'completa' : 'completam'}. Falta mais um. `}
        No lugar do COMPLETE ({formatarNota(nota)}), só nesta partida.
      </p>

      {deFora.length > 0 && (
        <div className="mt-5">
          <h3 className="text-base font-medium text-apagado">Dos outros times</h3>
          <ul className="mt-2 flex flex-col">
            {deFora.map((j) => {
              const doTime = corDe(j.id);
              return (
                <li key={j.id}>
                  <button
                    type="button"
                    onClick={() => onEscolher(j)}
                    aria-label={`${j.nome}${doTime ? `, do ${NOME_DA_COR[doTime]}` : ''}, nota ${formatarNota(j.nota)}`}
                    className={LINHA_TOCAVEL}
                  >
                    {doTime && <Colete cor={doTime} />}
                    <span className="min-w-0 flex-1 truncate text-linha font-medium text-tinta">{j.nome}</span>
                    <span className="shrink-0 text-base text-meta tabular-nums">{formatarNota(j.nota)}</span>
                    <Mais className="size-5 shrink-0 text-apagado" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <BuscaDeJogador
        id="busca-quem-completa"
        rotulo={deFora.length ? 'Alguém sem time' : 'Buscar pelo nome'}
        todos={todos}
        jaEstao={jaEstao}
        textoJaEsta="Já está no jogo"
        onEscolher={onEscolher}
        onCadastrado={onCadastrado}
      />

      <div className="mt-8">
        <button type="button" className={PILULA_SEGUNDA} onClick={onJogarSem}>
          Jogar sem
        </button>
        <p className="mt-2 text-base text-meta">
          O {time} joga com {jogaSemCom} nesta partida.
        </p>
      </div>
    </section>
  );
}

/** Conferência antes de começar: uma linha por vaga, com "Trocar", e a pílula de iniciar. */
export function ConferirQuemCompleta({
  corA,
  corB,
  linhas,
  iniciando,
  erro,
  onTrocar,
  onIniciar,
  onVoltar,
}: {
  corA: Cor;
  corB: Cor;
  linhas: { cor: Cor; resposta: Resposta; jogaCom: number }[];
  iniciando: boolean;
  erro: string | null;
  onTrocar: (vaga: number) => void;
  onIniciar: () => void;
  onVoltar: () => void;
}) {
  const confronto = `${NOME_DA_COR[corA]} × ${NOME_DA_COR[corB]}`;
  return (
    <section aria-labelledby="titulo-conferir" className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="titulo-conferir" className="font-placa text-2xl font-semibold">
          {confronto}
        </h2>
        <button type="button" className={`-mr-3 shrink-0 ${TEXTO}`} disabled={iniciando} onClick={onVoltar}>
          Voltar aos times
        </button>
      </div>
      <p className="mt-1 text-base text-apagado">Na próxima partida, a vaga volta a ser COMPLETE.</p>
      <ul aria-label="Quem completa" className="mt-4 flex flex-col gap-2">
        {linhas.map((l, i) => (
          <li key={i} className="flex min-h-toque items-center gap-3 rounded-placa bg-placa py-1 pr-1 pl-4">
            <Colete cor={l.cor} />
            <p className="min-w-0 flex-1 text-base text-apagado">
              {l.resposta.tipo === 'jogador' ? (
                <>
                  <span className="font-medium text-tinta">{l.resposta.jogador.nome}</span> completa o {NOME_DA_COR[l.cor]}
                </>
              ) : (
                <>
                  <span className="font-medium text-tinta">Ninguém:</span> o {NOME_DA_COR[l.cor]} joga com {l.jogaCom}
                </>
              )}
            </p>
            <button
              type="button"
              className={`shrink-0 ${TEXTO}`}
              disabled={iniciando}
              onClick={() => onTrocar(i)}
              aria-label={`Trocar quem completa o ${NOME_DA_COR[l.cor]}`}
            >
              Trocar
            </button>
          </li>
        ))}
      </ul>
      <Erro texto={erro} />
      <button type="button" className={`mt-4 ${PILULA}`} disabled={iniciando} onClick={onIniciar}>
        {iniciando ? 'Iniciando…' : `Iniciar ${confronto}`}
      </button>
    </section>
  );
}
