'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { Mais } from '@/components/icones';
import { CAMPO } from '@/components/pilula';
import { normalizarNome } from '@/domain/nome';
import type { JogadorNota } from '@/domain/sorteio';
import { cadastrarRapido } from './acoes';

const MAX_SUGESTOES = 6;

export function Erro({ texto }: { texto: string | null }) {
  return (
    <p role="alert" className={`text-base font-medium text-erro ${texto ? 'mt-3' : 'sr-only'}`}>
      {texto}
    </p>
  );
}

/** O texto digitado, guardado por quem chama quando a busca tem uma cópia por largura (celular e PC). */
export function useTermoDaBusca() {
  const [termo, setTermo] = useState('');
  return { termo, onTermo: setTermo };
}

/** Busca qualquer jogador ativo pelo nome (Joao acha João) e, se não existir, cadastra na hora. */
export function BuscaDeJogador({
  id,
  rotulo,
  todos,
  jaEstao,
  textoJaEsta,
  onEscolher,
  onCadastrado,
  autoFocus = false,
  className = 'mt-6',
  termo: termoDeFora,
  onTermo,
}: {
  id: string;
  rotulo: string;
  todos: JogadorNota[];
  jaEstao: Set<number>;
  textoJaEsta: string;
  onEscolher: (j: JogadorNota) => void;
  onCadastrado: (j: JogadorNota) => void;
  autoFocus?: boolean;
  className?: string;
  /** Com `useTermoDaBusca`: as duas cópias (celular e PC) mostram o mesmo texto e girar a tela não apaga. */
  termo?: string;
  onTermo?: (termo: string) => void;
}) {
  const [termoAqui, setTermoAqui] = useState('');
  const termo = termoDeFora ?? termoAqui;
  const setTermo = onTermo ?? setTermoAqui;
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startAcao] = useTransition();
  const campo = useRef<HTMLInputElement>(null);
  const t = normalizarNome(termo);

  const achados = useMemo(() => {
    if (!t) return [];
    return todos
      .map((j) => ({ j, chave: normalizarNome(j.nome) }))
      .filter((x) => x.chave.includes(t))
      .sort((x, y) => Number(y.chave.startsWith(t)) - Number(x.chave.startsWith(t)) || x.chave.localeCompare(y.chave, 'pt-BR'))
      .slice(0, MAX_SUGESTOES)
      .map((x) => x.j);
  }, [t, todos]);
  const existe = !!t && todos.some((j) => normalizarNome(j.nome) === t);

  function escolher(j: JogadorNota) {
    onEscolher(j);
    setTermo('');
    campo.current?.blur(); // fecha o teclado para a escolha do time aparecer inteira
  }

  function cadastrar() {
    const nome = termo.trim();
    startAcao(async () => {
      const r = await cadastrarRapido(nome);
      if (r.ok) {
        onCadastrado(r.jogador);
        setTermo('');
        campo.current?.blur();
      } else setErro(r.erro);
    });
  }

  return (
    <section aria-label={rotulo} className={className}>
      <label htmlFor={id} className="block text-base font-medium text-apagado">
        {rotulo}
      </label>
      <input
        id={id}
        ref={campo}
        value={termo}
        onChange={(e) => {
          setTermo(e.target.value);
          setErro(null);
        }}
        autoComplete="off"
        autoFocus={autoFocus}
        enterKeyHint="search"
        placeholder="Digite o nome"
        className={`mt-2 ${CAMPO}`}
      />
      {t && (
        <ul className="mt-2 flex flex-col">
          {achados.map((j) => {
            const ja = jaEstao.has(j.id);
            return (
              <li key={j.id}>
                <button
                  type="button"
                  disabled={ja || pendente}
                  onClick={() => escolher(j)}
                  className="-mx-4 flex h-toque w-[calc(100%+2rem)] items-center justify-between gap-3 rounded-placa px-4 text-left transition-colors hover:bg-placa active:bg-placa-alta disabled:hover:bg-transparent"
                >
                  <span className={`min-w-0 truncate text-linha font-medium ${ja ? 'text-meta' : 'text-tinta'}`}>{j.nome}</span>
                  {ja ? <span className="shrink-0 text-base text-meta">{textoJaEsta}</span> : <Mais className="size-5 shrink-0 text-apagado" />}
                </button>
              </li>
            );
          })}
          {!existe && (
            <li>
              <button
                type="button"
                disabled={pendente}
                onClick={cadastrar}
                className="-mx-4 flex min-h-toque w-[calc(100%+2rem)] items-center justify-between gap-3 rounded-placa px-4 py-2 text-left transition-colors hover:bg-placa active:bg-placa-alta disabled:hover:bg-transparent"
              >
                <span className="min-w-0">
                  <span className="block truncate text-linha font-medium text-tinta">
                    {pendente ? 'Cadastrando…' : `Cadastrar “${termo.trim()}”`}
                  </span>
                  <span className="block text-base text-meta">Jogador novo, nota 3,0</span>
                </span>
                <Mais className="size-5 shrink-0 text-apagado" />
              </button>
            </li>
          )}
        </ul>
      )}
      <Erro texto={erro} />
    </section>
  );
}
