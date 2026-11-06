'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { SetaDireita } from '@/components/icones';
import { SeletorDeNota } from '@/components/seletor-de-nota';
import { normalizarNome, parseNomesColados, separarNomes } from '@/domain/nome';
import { formatarNota } from '@/domain/sorteio';
import type { JogadorListado } from '@/server/jogadores';
import { colarNomes, mudarAtivo, mudarNota, renomear, zerarPinDoJogador } from './actions';
import { SalvadorDeNotas } from './salvar-notas';

const CAMPO =
  'h-toque w-full rounded-placa bg-placa px-4 text-linha text-tinta outline-none transition-shadow focus:ring-2 focus:ring-tinta';
const PILULA =
  'h-toque w-full rounded-full bg-tinta text-linha font-semibold text-chao transition-colors hover:bg-apagado active:bg-meta disabled:bg-placa-alta disabled:text-apagado';
const TEXTO =
  'flex h-12 items-center rounded-placa px-3 text-base font-medium text-apagado transition-colors hover:text-tinta disabled:text-meta';


type Confirmando = { id: number; tipo: 'zerar' | 'desativar' } | null;

// No PC (lg), as linhas viram uma tabela: nome (abre o editor), nota com o seletor na própria linha e o PIN.
const COLUNAS = 'lg:grid lg:grid-cols-[minmax(0,1fr)_14rem_8rem] lg:gap-x-6';

export function JogadoresAdmin({ jogadores }: { jogadores: JogadorListado[] }) {
  const [busca, setBusca] = useState('');
  const [verInativos, setVerInativos] = useState(false);
  const [aberto, setAberto] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState<Confirmando>(null);
  const [rascunho, setRascunho] = useState<{ id: number; texto: string; erro: string | null } | null>(null);
  const [colando, setColando] = useState(false);
  const [texto, setTexto] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [notasLocais, setNotasLocais] = useState<Record<number, number>>({});
  const [ocupado, startAcao] = useTransition();
  const jogadoresAtuais = useRef(jogadores);
  const salvador = useRef<SalvadorDeNotas | null>(null);

  // A nota local só sai quando o servidor já devolveu o mesmo valor e nada está esperando ou a caminho.
  function soltarNotasLocais() {
    setNotasLocais((locais) => {
      const resto = Object.entries(locais).filter(([id, nota]) => {
        const salva = jogadoresAtuais.current.find((j) => j.id === Number(id))?.nota;
        return salvador.current?.ocupado(Number(id)) || salva !== nota;
      });
      return resto.length === Object.keys(locais).length ? locais : Object.fromEntries(resto);
    });
  }

  useEffect(() => {
    jogadoresAtuais.current = jogadores;
    soltarNotasLocais();
  }, [jogadores]);

  useEffect(() => {
    const s = new SalvadorDeNotas(
      mudarNota,
      (id, r) => {
        if (r.ok) {
          soltarNotasLocais();
        } else {
          setNotasLocais((n) => Object.fromEntries(Object.entries(n).filter(([k]) => Number(k) !== id)));
          setAviso({ tipo: 'erro', texto: r.erro });
        }
      },
    );
    salvador.current = s;
    // Nota esperando os 500 ms não pode se perder ao sair da tela ou esconder a aba.
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
  }, []);

  const ativos = jogadores.filter((j) => j.ativo).length;
  const inativos = jogadores.length - ativos;

  const visiveis = useMemo(() => {
    const b = normalizarNome(busca);
    return jogadores.filter((j) => (verInativos || j.ativo) && (!b || normalizarNome(j.nome).includes(b)));
  }, [jogadores, busca, verInativos]);

  const previa = useMemo(
    () => separarNomes(parseNomesColados(texto), jogadores.map((j) => j.nome)),
    [texto, jogadores],
  );

  function nota(j: JogadorListado) {
    return notasLocais[j.id] ?? j.nota;
  }

  function ajustarNota(j: JogadorListado, passo: number) {
    const nova = Math.min(5, Math.max(0, nota(j) + passo));
    if (nova === nota(j)) return;
    setNotasLocais((n) => ({ ...n, [j.id]: nova }));
    salvador.current?.agendar(j.id, nova);
  }

  function confirmar(j: JogadorListado, tipo: 'zerar' | 'desativar') {
    startAcao(async () => {
      const r = tipo === 'zerar' ? await zerarPinDoJogador(j.id) : await mudarAtivo(j.id, false);
      setConfirmando(null);
      setAviso(
        r.ok
          ? { tipo: 'ok', texto: tipo === 'zerar' ? `PIN de ${j.nome} voltou para 1234.` : `${j.nome} foi desativado.` }
          : { tipo: 'erro', texto: r.erro },
      );
      if (r.ok && tipo === 'desativar') setAberto(null);
    });
  }

  function salvarNome(j: JogadorListado) {
    if (!rascunho || rascunho.id !== j.id) return;
    const texto = rascunho.texto;
    startAcao(async () => {
      const r = await renomear(j.id, texto);
      if (r.ok) {
        setRascunho(null);
        setAviso({ tipo: 'ok', texto: `Nome salvo: ${texto.trim().replace(/\s+/g, ' ')}.` });
      } else {
        setRascunho({ id: j.id, texto, erro: r.erro });
      }
    });
  }

  function reativar(j: JogadorListado) {
    startAcao(async () => {
      const r = await mudarAtivo(j.id, true);
      setAviso(r.ok ? { tipo: 'ok', texto: `${j.nome} voltou para a lista de jogadores.` } : { tipo: 'erro', texto: r.erro });
    });
  }

  function criar() {
    startAcao(async () => {
      const r = await colarNomes(texto);
      if (!r.ok) {
        setAviso({ tipo: 'erro', texto: r.erro });
        return;
      }
      const c = r.criados ?? 0;
      const i = r.ignorados ?? 0;
      setAviso({
        tipo: 'ok',
        texto: `${c === 1 ? '1 jogador criado' : `${c} jogadores criados`}${i ? `, ${i === 1 ? '1 ignorado' : `${i} ignorados`}` : ''}. PIN inicial: 1234.`,
      });
      setTexto('');
      setColando(false);
    });
  }

  return (
    <main className="flex flex-1 flex-col">
      {/* No PC: uma coluna de até 768px (uma tabela de 3 colunas não precisa da tela toda), com "Adicionar
          jogadores" na linha do título. No celular o `contents` some e tudo fica como antes. */}
      <div className="contents lg:grid lg:max-w-3xl lg:grid-cols-[minmax(0,1fr)_auto] lg:content-start lg:gap-x-6">
        <h1 className="mt-4 font-placa text-titulo font-semibold lg:col-start-1 lg:row-start-1">Jogadores</h1>
        <p className="mt-2 text-base text-apagado lg:col-start-1 lg:row-start-2">
          {ativos} {ativos === 1 ? 'ativo' : 'ativos'}
          {inativos > 0 && ` · ${inativos} ${inativos === 1 ? 'inativo' : 'inativos'}`}
        </p>

        <p
          role="status"
          aria-live="polite"
          className={`mt-4 text-base font-medium break-words lg:col-span-2 ${aviso?.tipo === 'erro' ? 'text-erro' : 'text-lima'} ${aviso ? '' : 'sr-only'}`}
        >
          {aviso?.texto}
        </p>

        {colando ? (
          <section
            className="mt-4 rounded-placa bg-placa p-4 lg:col-span-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6"
            aria-labelledby="colar-titulo"
          >
            <h2 id="colar-titulo" className="text-linha font-semibold lg:col-span-2">
              Colar nomes
            </h2>
            <label htmlFor="colar" className="mt-1 block text-base text-apagado lg:col-span-2">
              Um nome por linha. Numeração, (M), (D) e ✅ saem sozinhos.
            </label>
            <textarea
              id="colar"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={6}
              autoFocus
              autoCapitalize="words"
              autoCorrect="off"
              spellCheck={false}
              placeholder={'1. Pepe (M) ✅\n2. Caio\n3. Manoel ⏳'}
              aria-describedby="previa"
              className="mt-3 w-full resize-y rounded-placa bg-chao p-4 text-linha leading-relaxed text-tinta outline-none transition-shadow focus:ring-2 focus:ring-tinta lg:col-start-1 lg:row-start-3"
            />
            {/* No PC a prévia fica ao lado da área de texto, na mesma altura. */}
            <div id="previa" className="mt-4 lg:col-start-2 lg:row-start-3 lg:mt-3" aria-live="polite">
              {previa.criar.length + previa.ignorar.length === 0 ? (
                <p className="text-base text-meta">A prévia aparece aqui.</p>
              ) : (
                <>
                  <p className="text-base font-medium text-tinta">
                    {previa.criar.length === 1 ? 'Vai entrar 1 jogador' : `Vão entrar ${previa.criar.length} jogadores`}
                  </p>
                  {previa.criar.length > 0 && (
                    <ul className="mt-2 rounded-placa bg-placa-alta px-4 py-2">
                      {previa.criar.map((n) => (
                        <li key={n} className="py-1 text-base break-words">
                          {n}
                        </li>
                      ))}
                    </ul>
                  )}
                  {previa.ignorar.length > 0 && (
                    <>
                      <p className="mt-4 text-base font-medium text-apagado">
                        Ficam de fora ({previa.ignorar.length}): já existem ou repetem
                      </p>
                      <p className="mt-1 text-base break-words text-meta">{previa.ignorar.join(', ')}</p>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="lg:col-span-2 lg:mt-4 lg:flex lg:items-center lg:gap-3">
              <button type="button" onClick={criar} disabled={ocupado || previa.criar.length === 0} className={`${PILULA} mt-4 lg:mt-0 lg:w-auto lg:px-8`}>
                {ocupado
                  ? 'Criando…'
                  : previa.criar.length === 0
                    ? 'Criar jogadores'
                    : previa.criar.length === 1
                      ? 'Criar 1 jogador'
                      : `Criar ${previa.criar.length} jogadores`}
              </button>
              <button
                type="button"
                onClick={() => {
                  setColando(false);
                  setTexto('');
                }}
                className={`${TEXTO} mx-auto mt-1 lg:mx-0 lg:mt-0`}
              >
                Cancelar
              </button>
            </div>
          </section>
        ) : (
          <button
            type="button"
            onClick={() => setColando(true)}
            className={`${PILULA} mt-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:w-auto lg:self-end lg:px-8`}
          >
            Adicionar jogadores
          </button>
        )}

        <label htmlFor="busca" className="mt-6 block text-base font-medium text-apagado lg:col-span-2">
          Buscar jogador
        </label>
        <input
          id="busca"
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Nome"
          className={`${CAMPO} mt-2 lg:col-span-2`}
        />

        {inativos > 0 && (
          <label className="-mx-3 mt-1 flex h-12 w-fit cursor-pointer items-center gap-3 px-3 text-base text-apagado lg:col-span-2">
            <input
              type="checkbox"
              checked={verInativos}
              onChange={(e) => setVerInativos(e.target.checked)}
              className="size-5 accent-white"
            />
            Mostrar inativos
          </label>
        )}

        {/* Cabeçalho da tabela no PC; para o leitor de tela, cada célula já diz o que é (grupo "Nota de…", "PIN:"). */}
        {visiveis.length > 0 && (
          <div aria-hidden="true" className={`hidden lg:col-span-2 lg:mt-4 lg:h-10 lg:items-end lg:pr-4 lg:text-sm lg:text-meta ${COLUNAS}`}>
            <span className="pl-4">Nome</span>
            <span className="text-center">Nota</span>
            <span>PIN</span>
          </div>
        )}

        <ul className="mt-3 flex flex-col gap-2 lg:col-span-2 lg:mt-1">
          {visiveis.map((j) => {
            const expandido = aberto === j.id;
            const conf = confirmando?.id === j.id ? confirmando.tipo : null;
            return (
              <li key={j.id} className={`rounded-placa bg-placa lg:items-center lg:pr-4 ${COLUNAS}`}>
                <button
                  type="button"
                  aria-expanded={expandido}
                  aria-controls={`jogador-${j.id}`}
                  onClick={() => {
                    setAberto(expandido ? null : j.id);
                    setConfirmando(null);
                    setRascunho(null);
                  }}
                  className="flex min-h-toque w-full items-center justify-between gap-3 rounded-placa px-4 py-2 text-left transition-colors active:bg-placa-alta lg:self-stretch lg:hover:bg-placa-alta/60 lg:active:bg-placa-alta"
                >
                  <span className="min-w-0">
                    <span className={`block truncate text-linha font-medium ${j.ativo ? 'text-tinta' : 'text-apagado'}`}>{j.nome}</span>
                    {(!j.ativo || j.pinPadrao) && (
                      // No PC o PIN tem coluna própria: embaixo do nome fica só o "Inativo".
                      <span className={`block text-base text-meta${j.ativo ? ' lg:hidden' : ''}`}>{!j.ativo ? 'Inativo' : 'PIN ainda é 1234'}</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="font-placa text-[1.75rem] leading-none font-semibold tabular-nums lg:hidden">{formatarNota(nota(j))}</span>
                    <SetaDireita className={`size-5 text-meta transition-transform ${expandido ? 'rotate-90' : ''}`} />
                  </span>
                </button>

                {/* No PC a nota se ajusta na própria linha (o mesmo seletor e a mesma regra de salvar). */}
                <div className="hidden lg:flex lg:justify-center lg:py-1.5">
                  <SeletorDeNota valor={nota(j)} rotulo={`Nota de ${j.nome}`} onPasso={(passo) => ajustarNota(j, passo)} dica={false} />
                </div>
                <span className="hidden text-base text-meta lg:block">
                  <span className="sr-only">PIN: </span>
                  {j.pinPadrao ? 'Ainda é 1234' : 'Trocado'}
                </span>

                {expandido && (
                  <div id={`jogador-${j.id}`} className="px-4 pb-3 lg:col-span-3 lg:pt-1 lg:pb-4">
                    <div className="lg:hidden">
                      <SeletorDeNota valor={nota(j)} rotulo={`Nota de ${j.nome}`} onPasso={(passo) => ajustarNota(j, passo)} />
                    </div>

                    {(() => {
                      const r = rascunho?.id === j.id ? rascunho : null;
                      const texto = r?.texto ?? j.nome;
                      const mudou = texto.trim().replace(/\s+/g, ' ') !== j.nome;
                      return (
                        <form
                          className="mt-3 lg:mt-0 lg:max-w-md"
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (mudou) salvarNome(j);
                          }}
                        >
                          <label htmlFor={`nome-${j.id}`} className="block text-base font-medium text-apagado">
                            Nome
                          </label>
                          <input
                            id={`nome-${j.id}`}
                            value={texto}
                            onChange={(e) => setRascunho({ id: j.id, texto: e.target.value, erro: null })}
                            maxLength={60}
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="words"
                            spellCheck={false}
                            enterKeyHint="done"
                            aria-invalid={r?.erro ? true : undefined}
                            aria-describedby={`nome-erro-${j.id}`}
                            className="mt-2 h-toque w-full rounded-placa bg-chao px-4 text-linha text-tinta outline-none transition-shadow focus:ring-2 focus:ring-tinta aria-invalid:ring-2 aria-invalid:ring-erro"
                          />
                          <p id={`nome-erro-${j.id}`} role="alert" className="text-base font-medium text-erro empty:hidden">
                            {r?.erro ? <span className="mt-2 block">{r.erro}</span> : null}
                          </p>
                          {mudou && (
                            <button type="submit" disabled={ocupado || !texto.trim()} className={`${PILULA} mt-3 lg:w-auto lg:px-8`}>
                              {ocupado ? 'Salvando…' : 'Salvar nome'}
                            </button>
                          )}
                        </form>
                      );
                    })()}

                    {conf ? (
                      <div className="mt-3 rounded-placa bg-placa-alta p-4 lg:max-w-md">
                        <p className="text-base break-words">
                          {conf === 'zerar'
                            ? `Zerar o PIN de ${j.nome}? Ele volta para 1234, precisa criar outro e sai de todos os aparelhos.`
                            : `Desativar ${j.nome}? Ele sai da busca e de todos os aparelhos. Dá para reativar depois.`}
                        </p>
                        <div className="lg:mt-3 lg:flex lg:items-center lg:gap-3">
                          <button type="button" onClick={() => confirmar(j, conf)} disabled={ocupado} className={`${PILULA} mt-3 lg:mt-0 lg:w-auto lg:px-8`}>
                            {ocupado ? 'Aplicando…' : conf === 'zerar' ? 'Zerar PIN' : 'Desativar'}
                          </button>
                          <button type="button" onClick={() => setConfirmando(null)} className={`${TEXTO} mx-auto mt-1 lg:mx-0 lg:mt-0`}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-x-2">
                        {j.ativo ? (
                          <>
                            <button type="button" onClick={() => setConfirmando({ id: j.id, tipo: 'zerar' })} className={`${TEXTO} -ml-3`}>
                              Zerar PIN
                            </button>
                            <button type="button" onClick={() => setConfirmando({ id: j.id, tipo: 'desativar' })} className={TEXTO}>
                              Desativar
                            </button>
                          </>
                        ) : (
                          <button type="button" onClick={() => reativar(j)} disabled={ocupado} className={`${TEXTO} -ml-3`}>
                            Reativar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {visiveis.length === 0 && (
          <p className="mt-3 text-base text-meta lg:col-span-2">
            {jogadores.length === 0 ? (
              <>
                Nenhum jogador ainda. <span className="lg:hidden">Toque</span>
                <span className="hidden lg:inline">Clique</span> em Adicionar jogadores.
              </>
            ) : (
              `Ninguém chamado “${busca.trim()}”.`
            )}
          </p>
        )}
      </div>
    </main>
  );
}
