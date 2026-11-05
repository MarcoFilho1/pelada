'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { flushSync } from 'react-dom';
import { SetaDireita, SetaEsquerda } from '@/components/icones';
import { PlacasPin } from '@/components/placas-pin';
import { PIN_PADRAO } from '@/domain/pin';
import { MSG_ALGO_DEU_ERRADO } from '@/server/erros';
import { entrar, sugerirJogadores, type ErroEntrar } from './actions';

type Jogador = { id: number; nome: string };

const ESPERA_BUSCA_MS = 150;

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' });

function mensagem(erro: ErroEntrar): string {
  if (erro.motivo === 'falha') return MSG_ALGO_DEU_ERRADO;
  return erro.motivo === 'bloqueado'
    ? `Muitas tentativas. Tente de novo às ${HORA.format(new Date(erro.bloqueadoAte))}.`
    : 'PIN errado. Tente de novo.';
}

export function EntrarJogador() {
  const [termo, setTermo] = useState('');
  const [sugestoes, setSugestoes] = useState<Jogador[] | null>(null);
  const [escolhido, setEscolhido] = useState<Jogador | null>(null);
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState<ErroEntrar | null>(null);
  const [conferindo, startConferir] = useTransition();
  const pinRef = useRef<HTMLInputElement>(null);
  const nomeRef = useRef<HTMLInputElement>(null);
  const ultimaBusca = useRef(0);

  // Sugestões enquanto digita; só a resposta da busca mais recente vale.
  useEffect(() => {
    const t = termo.trim();
    if (!t) return;
    const n = ++ultimaBusca.current;
    const timer = setTimeout(async () => {
      try {
        const achados = await sugerirJogadores(t);
        if (n === ultimaBusca.current) setSugestoes(achados);
      } catch {
        if (n === ultimaBusca.current) setSugestoes(null);
      }
    }, ESPERA_BUSCA_MS);
    return () => clearTimeout(timer);
  }, [termo]);

  function escolher(j: Jogador) {
    // flushSync + focus no mesmo toque: no iPhone o teclado só abre dentro do gesto.
    flushSync(() => {
      setEscolhido(j);
      setPin('');
      setErro(null);
    });
    pinRef.current?.focus();
  }

  function voltar() {
    flushSync(() => {
      setEscolhido(null);
      setPin('');
      setErro(null);
    });
    nomeRef.current?.focus();
  }

  function digitarPin(v: string) {
    if (erro && erro.motivo !== 'bloqueado') setErro(null);
    setPin(v);
    if (v.length === 4 && escolhido) {
      startConferir(async () => {
        const r = await entrar(escolhido.id, v);
        // só volta aqui se deu errado; se deu certo, a action redireciona
        if (r?.erro) {
          setErro(r.erro);
          setPin('');
        }
      });
    }
  }

  if (escolhido) {
    const bloqueado = erro?.motivo === 'bloqueado';
    return (
      <main className="flex flex-1 flex-col">
        <button
          type="button"
          onClick={voltar}
          className="-mx-3 mt-2 flex h-12 w-fit items-center gap-1 px-3 text-base font-medium text-apagado transition-colors hover:text-tinta"
        >
          <SetaEsquerda />
          Não sou eu
        </button>
        <h1 className="mt-4 font-placa text-titulo font-semibold break-words">{escolhido.nome}</h1>
        <p className="mt-2 text-base text-apagado">Digite seu PIN de 4 números.</p>

        <div className="mt-8">
          <PlacasPin
            ref={pinRef}
            id="pin"
            rotulo={`PIN de ${escolhido.nome}`}
            valor={pin}
            onChange={digitarPin}
            estado={erro ? 'erro' : 'normal'}
            desabilitado={bloqueado}
            travado={conferindo}
            descricaoId="pin-ajuda"
          />
        </div>

        <p id="pin-ajuda" role="status" aria-live="polite" className="mt-6 min-h-12 text-center text-base">
          {erro ? (
            <>
              <span className="block font-medium text-erro">{mensagem(erro)}</span>
              {erro.motivo !== 'falha' && <span className="mt-1 block text-meta">Esqueceu o PIN? Peça ao admin para zerar.</span>}
            </>
          ) : conferindo ? (
            <span className="text-apagado">Conferindo…</span>
          ) : (
            <span className="text-meta">
              Primeiro acesso? Seu PIN é <span className="font-semibold text-tinta">{PIN_PADRAO}</span>.
            </span>
          )}
        </p>
      </main>
    );
  }

  const t = termo.trim();
  const lista = t ? sugestoes : null;

  return (
    <main className="flex flex-1 flex-col">
      <h1 className="mt-6 font-placa text-titulo font-semibold">Quem é você?</h1>
      <p className="mt-2 text-base text-apagado">Pelada de quarta, 20h30.</p>
      <label htmlFor="nome" className="mt-6 block text-base font-medium text-apagado">
        Seu nome
      </label>
      <input
        ref={nomeRef}
        id="nome"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="search"
        placeholder="Comece a digitar"
        aria-controls="sugestoes"
        aria-describedby="sugestoes-status"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && lista?.length === 1) escolher(lista[0]);
        }}
        className="mt-2 h-toque w-full rounded-placa bg-placa px-4 text-linha text-tinta outline-none transition-shadow focus:ring-2 focus:ring-tinta"
      />

      <ul id="sugestoes" className="mt-3 flex flex-col">
        {lista?.map((j) => (
          <li key={j.id}>
            <button
              type="button"
              onClick={() => escolher(j)}
              className="-mx-4 flex h-toque w-[calc(100%+2rem)] items-center justify-between rounded-placa px-4 text-left text-linha font-medium text-tinta transition-colors hover:bg-placa active:bg-placa-alta"
            >
              <span className="truncate">{j.nome}</span>
              <SetaDireita className="size-5 shrink-0 text-meta" />
            </button>
          </li>
        ))}
      </ul>
      <p id="sugestoes-status" role="status" aria-live="polite" className="text-base text-meta">
        {lista && lista.length === 0 ? (
          `Ninguém chamado “${t}”. Confira com o admin.`
        ) : lista ? (
          <span className="sr-only">{lista.length === 1 ? '1 nome encontrado' : `${lista.length} nomes encontrados`}</span>
        ) : null}
      </p>
    </main>
  );
}
