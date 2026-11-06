'use client';

// O COMPLETE na tela de sorteio: a folha de quem toca num COMPLETE (nota, tirar, pôr alguém) e a
// escolha de quem entra no lugar dele.

import { useEffect, useRef, useState } from 'react';
import { Mais } from '@/components/icones';
import { NOME_DA_COR } from '@/components/colete';
import { PILULA, PILULA_SEGUNDA, TEXTO } from '@/components/pilula';
import { SeletorDeNota } from '@/components/seletor-de-nota';
import { formatarNota, type Cor, type JogadorNota } from '@/domain/sorteio';
import type { TimeDaPelada } from '@/server/times';
import { SalvadorDeNotas } from '../jogadores/salvar-notas';
import { mudarNotaDoComplete } from './acoes';
import { BuscaDeJogador, Erro } from './busca-de-jogador';

/** Nota de quem o admin põe à mão num time: o meio das notas que o sorteio escolhe sozinho. */
export const NOTA_DO_COMPLETE_NOVO = 3;

/** Conteúdo da folha de um COMPLETE escolhido (dentro da Barra em modo folha; no PC, no Painel ao lado). */
export function FolhaDoComplete({
  cor,
  nota,
  resumo,
  pendente,
  onPasso,
  onTirar,
  onPorAlguem,
  onFechar,
  pc = false,
}: {
  cor: Cor;
  nota: number;
  /** A soma do time e a diferença, ao vivo: a folha cobre os cartões no celular. */
  resumo: string;
  pendente: boolean;
  onPasso: (passo: number) => void;
  onTirar: () => void;
  /** Só nos times definitivos: alguém fica no lugar do COMPLETE pelo resto da noite. */
  onPorAlguem?: () => void;
  onFechar: () => void;
  /** No Painel ao lado (PC): o seletor sem o "de 0 a 5", que não cabe na coluna (o limite fica nos botões apagados). */
  pc?: boolean;
}) {
  const time = NOME_DA_COR[cor];
  return (
    <div>
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-base text-apagado">
          <span className="block truncate text-linha font-medium text-tinta">COMPLETE do {time}</span>
          {resumo}
        </p>
        <button type="button" className={`-mr-3 ${TEXTO}`} disabled={pendente} onClick={onFechar}>
          Fechar
        </button>
      </div>
      <div className="mt-3">
        <SeletorDeNota valor={nota} rotulo={`Nota do COMPLETE do ${time}`} onPasso={onPasso} desabilitado={pendente} dica={!pc} />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {onPorAlguem && (
          <button type="button" className={PILULA} disabled={pendente} onClick={onPorAlguem}>
            Pôr alguém no lugar
          </button>
        )}
        <button type="button" className={PILULA_SEGUNDA} disabled={pendente} onClick={onTirar}>
          Tirar o COMPLETE
        </button>
      </div>
    </div>
  );
}

/**
 * Quem entra no lugar do COMPLETE: primeiro quem está na lista da pelada e ainda não tem time, depois
 * a busca entre todos os ativos (com o cadastro rápido). Uma tarefa só: a busca fica no alto, acima
 * do teclado. No celular ocupa a tela; no PC, a coluna da esquerda, com os times à vista.
 */
export function EscolherQuemEntra({
  cor,
  nota,
  todos,
  emTime,
  naLista,
  pendente,
  erro,
  onEscolher,
  onCadastrado,
  onCancelar,
}: {
  cor: Cor;
  nota: number;
  todos: JogadorNota[];
  emTime: Set<number>;
  /** Na lista da pelada (confirmados, pendentes, fila) e sem time atual. */
  naLista: JogadorNota[];
  pendente: boolean;
  erro: string | null;
  onEscolher: (j: JogadorNota) => void;
  onCadastrado: (j: JogadorNota) => void;
  onCancelar: () => void;
}) {
  const time = NOME_DA_COR[cor];
  return (
    <section aria-labelledby="titulo-quem-entra" className="mt-6 pb-8 lg:mt-0">
      <div className="flex items-center justify-between gap-3">
        <h2 id="titulo-quem-entra" className="font-placa text-2xl font-semibold">
          Quem entra no {time}?
        </h2>
        <button type="button" className={`-mr-3 shrink-0 ${TEXTO}`} disabled={pendente} onClick={onCancelar}>
          Cancelar
        </button>
      </div>
      <p className="mt-1 text-base text-apagado">
        No lugar do COMPLETE ({formatarNota(nota)}). Fica no time pelo resto da noite.
      </p>

      {naLista.length > 0 && (
        <div className="mt-5">
          <h3 className="text-base font-medium text-apagado">Na lista, sem time</h3>
          <ul className="mt-2 flex flex-col">
            {naLista.map((j) => (
              <li key={j.id}>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => onEscolher(j)}
                  className="-mx-4 flex h-toque w-[calc(100%+2rem)] items-center justify-between gap-3 rounded-placa px-4 text-left transition-colors hover:bg-placa active:bg-placa-alta disabled:hover:bg-transparent"
                >
                  <span className="min-w-0 truncate text-linha font-medium text-tinta">{j.nome}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-base text-meta tabular-nums">
                      <span className="sr-only">nota </span>
                      {formatarNota(j.nota)}
                    </span>
                    <Mais className="size-5 text-apagado" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <BuscaDeJogador
        id="busca-complete"
        rotulo={naLista.length ? 'Outra pessoa' : 'Buscar pelo nome'}
        todos={todos}
        jaEstao={emTime}
        textoJaEsta="Já tem time"
        onEscolher={onEscolher}
        onCadastrado={onCadastrado}
        autoFocus={naLista.length === 0}
      />
      <Erro texto={erro} />
    </section>
  );
}

/**
 * Notas dos COMPLETE nos times salvos, como o seletor de nota dos jogadores: salva sozinho 500 ms
 * depois do último toque (e na hora ao esconder a aba ou sair); o valor local vale até o servidor
 * devolver o mesmo número.
 */
export function useNotasDosCompletes(times: TimeDaPelada[], setAviso: (a: { tipo: 'erro'; texto: string }) => void) {
  const [locais, setLocais] = useState<Record<number, number>>({});
  const atuais = useRef(times);
  const salvador = useRef<SalvadorDeNotas | null>(null);
  /** COMPLETE que está sendo tirado ou preenchido: a nota que ainda espera não vai, e erro dela não conta. */
  const sumindo = useRef(new Set<number>());

  // Sai quando o servidor já tem o mesmo valor e nada espera; some junto se o COMPLETE sumiu.
  function soltar() {
    setLocais((ls) => {
      const resto = Object.entries(ls).filter(([id, nota]) => {
        const salva = atuais.current.flatMap((t) => t.completes).find((c) => c.id === Number(id))?.nota;
        if (salva === undefined) return false;
        return salvador.current?.ocupado(Number(id)) || salva !== nota;
      });
      return resto.length === Object.keys(ls).length ? ls : Object.fromEntries(resto);
    });
  }

  useEffect(() => {
    atuais.current = times;
    soltar();
  }, [times]);

  useEffect(() => {
    const salvar = (id: number, nota: number) =>
      sumindo.current.has(id) ? Promise.resolve({ ok: true as const }) : mudarNotaDoComplete(id, nota);
    const s = new SalvadorDeNotas(salvar, (id, r) => {
      if (r.ok) soltar();
      else if (sumindo.current.has(id)) setLocais((ls) => Object.fromEntries(Object.entries(ls).filter(([k]) => Number(k) !== id)));
      else {
        setLocais((ls) => Object.fromEntries(Object.entries(ls).filter(([k]) => Number(k) !== id)));
        setAviso({ tipo: 'erro', texto: r.erro });
      }
    });
    salvador.current = s;
    const aoEsconder = () => {
      if (document.visibilityState === 'hidden') s.descarregar();
    };
    const aoSair = () => s.descarregar();
    window.addEventListener('pagehide', aoSair);
    document.addEventListener('visibilitychange', aoEsconder);
    return () => {
      s.descarregar();
      window.removeEventListener('pagehide', aoSair);
      document.removeEventListener('visibilitychange', aoEsconder);
      salvador.current = null;
    };
  }, [setAviso]);

  return {
    nota: (c: { id: number; nota: number }) => locais[c.id] ?? c.nota,
    mudar(id: number, nota: number) {
      setLocais((ls) => ({ ...ls, [id]: nota }));
      salvador.current?.agendar(id, nota);
    },
    descarregar: () => salvador.current?.descarregar(),
    esquecer: (id: number) => sumindo.current.add(id),
    /** A ação que ia apagar o COMPLETE falhou: a nota local volta a ser salva. */
    lembrar(id: number) {
      sumindo.current.delete(id);
      if (locais[id] !== undefined) salvador.current?.agendar(id, locais[id]);
    },
  };
}
