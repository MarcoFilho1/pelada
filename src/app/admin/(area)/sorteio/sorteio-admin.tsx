'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, useTransition } from 'react';
import { NOME_DA_COR } from '@/components/colete';
import { Marca } from '@/components/icones';
import { TEXTO } from '@/components/pilula';
import { CORES, formatarNota, rotuloDaDiferenca, type JogadorNota } from '@/domain/sorteio';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import type { TimeDaPelada } from '@/server/times';
import { marcarDefinitivo, mover, porComplete, preencher, sortear, tirarComplete } from './acoes';
import { BuscaDeJogador, Erro, useTermoDaBusca } from './busca-de-jogador';
import { EscolherQuemEntra, FolhaDoComplete, NOTA_DO_COMPLETE_NOVO, useNotasDosCompletes } from './complete';
import { AcoesDoSorteio, AvisoDoSorteio, LevarEscolhido, SortearDeNovo, TrocarEscolhido, type Aviso } from './folhas';
import {
  Barra,
  Equilibrio,
  GradeDeTimes,
  PainelAoLado,
  paraSorteado,
  SoNo,
  somar,
  VAGAS,
  type CompleteEscolhido,
  type CompleteNaTela,
  type TimeNaTela,
} from './times-na-tela';

type Props = {
  peladaId: number;
  /** 'DD/MM' da quarta. */
  data: string;
  /** A pelada é a de hoje (senão é a última que teve). */
  hoje: boolean;
  cancelada: boolean;
  ativos: JogadorNota[];
  /** Quem começa marcado: os confirmados da lista, ou quem já está nos times salvos. */
  marcados: number[];
  /** Na lista sem confirmar ou na fila: aparecem desmarcados. */
  sugeridos: number[];
  times: TimeDaPelada[];
  /** Partidas já encerradas nesta pelada (com times salvos, um sorteio novo pede confirmação). */
  jogadas: number;
  /** Id da partida rolando (o que mudar aqui só vale para a próxima), ou null. */
  emAndamento: number | null;
};

const passoDeNota = (nota: number, passo: number) => Math.min(5, Math.max(0, nota + passo));

/** O que a nota do COMPLETE muda, dito na folha (ela cobre os cartões e a diferença no celular). */
function resumoDoTime(times: TimeNaTela[], indice: number) {
  return `Soma ${formatarNota(somar(times[indice]))} · ${rotuloDaDiferenca(times.map(paraSorteado))}`;
}

/**
 * No PC (DESIGN.md › No PC): a coluna estreita da esquerda (quem joga, a busca, o Painel ao lado) e os times à
 * direita, com a diferença e as ações em cima. No celular os dois lados somem (`contents`) e tudo fica numa coluna.
 */
const COLUNAS = 'contents lg:mt-8 lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start lg:gap-x-10';
const ESQUERDA = 'contents lg:block lg:self-stretch';
/** Os times ficam presos no alto enquanto a lista de quem joga (22+ nomes) rola ao lado. */
const DIREITA = 'lg:sticky lg:top-6 lg:block lg:@container';

export function SorteioAdmin(p: Props) {
  const [refazendo, setRefazendo] = useState(false);
  const definitivo = p.times.length > 0 && !refazendo;

  return (
    <main className="flex flex-1 flex-col">
      <h1 className="mt-6 font-placa text-titulo font-semibold">Quarta, {p.data}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-base text-apagado">
        <span>{p.hoje ? 'Hoje' : 'A última pelada'}</span>
        {p.cancelada && <span className="font-medium text-tinta">· Cancelada</span>}
        {definitivo && (
          <span className="flex items-center gap-1 font-medium text-tinta">
            · Times definitivos
            <Marca className="size-5 shrink-0 text-lima" />
          </span>
        )}
      </p>
      {p.emAndamento !== null && (
        <div role="status" className="mt-3 flex items-center gap-3 rounded-placa bg-placa py-1 pr-1 pl-4">
          <p className="flex-1 py-2 text-base font-medium text-tinta">Partida em andamento — mudanças valem para a próxima.</p>
          <Link href={`/admin/partida/${p.emAndamento}`} className={`shrink-0 ${TEXTO}`}>
            Anotador
          </Link>
        </div>
      )}
      {definitivo ? (
        <Definitivo {...p} onRefazer={() => setRefazendo(true)} />
      ) : (
        <Sorteio {...p} onVoltar={p.times.length ? () => setRefazendo(false) : undefined} onSalvo={() => setRefazendo(false)} />
      )}
    </main>
  );
}

// ---- Antes de definir: quem joga, sortear, trocar --------------------------------------

type Selecao = { time: number; id: number };

/** Com times salvos a noite já começou: partidas abrem e fecham enquanto o admin refaz o sorteio. */
function AtualizarSozinho() {
  useAutoRefresh(5000);
  return null;
}

function Sorteio(p: Props & { onVoltar?: () => void; onSalvo: () => void }) {
  const [cadastrados, setCadastrados] = useState<JogadorNota[]>([]);
  const todos = useMemo(() => [...p.ativos, ...cadastrados.filter((c) => !p.ativos.some((a) => a.id === c.id))], [p.ativos, cadastrados]);
  const porId = useMemo(() => new Map(todos.map((j) => [j.id, j])), [todos]);
  const [linhas, setLinhas] = useState<number[]>(() => [...p.marcados, ...p.sugeridos]);
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set(p.marcados));
  const [proposta, setProposta] = useState<TimeNaTela[] | null>(null);
  const [selecao, setSelecao] = useState<Selecao | null>(null);
  const [completeAberto, setCompleteAberto] = useState<CompleteEscolhido | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [troca, setTroca] = useState<{ ids: number[]; n: number }>({ ids: [], n: 0 });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startAcao] = useTransition();
  const [acao, setAcao] = useState<'sortear' | 'definir' | null>(null);
  const proximaChave = useRef(1);

  const visiveis = linhas.filter((id) => porId.has(id));
  const escolhidos = visiveis.filter((id) => marcados.has(id));
  const nTimes = Math.min(CORES.length, escolhidos.length);
  const viramComplete = Math.max(0, nTimes * VAGAS - escolhidos.length);
  // No PC "Quem joga" fica à vista com os times: mexeu nas marcas depois de sortear, a proposta não vale mais.
  const naProposta = useMemo(() => proposta && new Set(proposta.flatMap((t) => t.jogadores.map((j) => j.id))), [proposta]);
  const quemJogaMudou = !!naProposta && (naProposta.size !== escolhidos.length || escolhidos.some((id) => !naProposta.has(id)));

  function alternar(id: number) {
    setConfirmando(false);
    setMarcados((m) => {
      const novo = new Set(m);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function incluir(j: JogadorNota) {
    setConfirmando(false);
    setLinhas((ls) => (ls.includes(j.id) ? ls : [...ls, j.id]));
    setMarcados((m) => new Set(m).add(j.id));
  }

  function fecharFolhas() {
    setSelecao(null);
    setCompleteAberto(null);
    setConfirmando(false);
  }

  function rodarSorteio() {
    setErro(null);
    fecharFolhas();
    setAcao('sortear');
    startAcao(async () => {
      const r = await sortear(escolhidos);
      if (r.ok) {
        setProposta(
          r.times.map((t) => ({ jogadores: t.jogadores, completes: t.completes.map((nota) => ({ chave: proximaChave.current++, nota })) })),
        );
        setTroca({ ids: [], n: troca.n + 1 });
      } else setErro(r.erro);
      setAcao(null);
    });
  }

  function definir() {
    if (!proposta) return;
    setErro(null);
    setSelecao(null);
    setCompleteAberto(null);
    // Partidas jogadas ficam com os times da época: o admin lê isso antes de valer.
    if (p.jogadas > 0 && !confirmando) {
      setConfirmando(true);
      return;
    }
    setAcao('definir');
    startAcao(async () => {
      const r = await marcarDefinitivo(
        p.peladaId,
        proposta.map((t) => t.jogadores.map((j) => j.id)),
        proposta.map((t) => t.completes.map((c) => c.nota)),
      );
      if (r.ok) p.onSalvo();
      else setErro(r.erro);
      setConfirmando(false);
      setAcao(null);
    });
  }

  function tocar(time: number, id: number) {
    if (!proposta || pendente) return;
    setCompleteAberto(null);
    setConfirmando(false);
    if (!selecao || selecao.time === time) {
      setSelecao(selecao?.id === id ? null : { time, id });
      return;
    }
    const outro = selecao;
    const times = proposta.map((t) => ({ ...t, jogadores: [...t.jogadores] }));
    const a = times[outro.time].jogadores.findIndex((j) => j.id === outro.id);
    const b = times[time].jogadores.findIndex((j) => j.id === id);
    [times[outro.time].jogadores[a], times[time].jogadores[b]] = [times[time].jogadores[b], times[outro.time].jogadores[a]];
    const ordenar = (t: JogadorNota[]) => t.sort((x, y) => y.nota - x.nota || x.nome.localeCompare(y.nome, 'pt-BR'));
    ordenar(times[outro.time].jogadores);
    ordenar(times[time].jogadores);
    setProposta(times);
    setSelecao(null);
    setTroca({ ids: [outro.id, id], n: troca.n + 1 });
  }

  function mudarCompletes(time: number, f: (cs: CompleteNaTela[]) => CompleteNaTela[]) {
    setProposta((ps) => ps && ps.map((t, i) => (i === time ? { ...t, completes: f(t.completes) } : t)));
  }

  const aberto = proposta && completeAberto ? proposta[completeAberto.time]?.completes.find((c) => c.chave === completeAberto.chave) : undefined;
  const selecionado = proposta && selecao ? porId.get(selecao.id) : undefined;
  const motivoTravado = p.emAndamento !== null ? 'Tem partida em andamento. Encerre no anotador para marcar os times novos.' : null;

  // A folha do celular e o Painel ao lado do PC mostram a mesma coisa, do mesmo estado.
  const painel = (pc: boolean) =>
    proposta && aberto && completeAberto ? (
      <FolhaDoComplete
        pc={pc}
        cor={CORES[completeAberto.time]}
        nota={aberto.nota}
        resumo={resumoDoTime(proposta, completeAberto.time)}
        pendente={pendente}
        onPasso={(passo) =>
          mudarCompletes(completeAberto.time, (cs) => cs.map((c) => (c.chave === aberto.chave ? { ...c, nota: passoDeNota(c.nota, passo) } : c)))
        }
        onTirar={() => {
          mudarCompletes(completeAberto.time, (cs) => cs.filter((c) => c.chave !== aberto.chave));
          setCompleteAberto(null);
        }}
        onFechar={() => setCompleteAberto(null)}
      />
    ) : selecionado ? (
      <TrocarEscolhido nome={selecionado.nome} onCancelar={() => setSelecao(null)} />
    ) : null;
  const temPainel = !!aberto || !!selecionado;

  const acoes = (pc: boolean) => (
    <AcoesDoSorteio
      pc={pc}
      fase={proposta && !quemJogaMudou ? 'proposta' : 'escolher'}
      escolhidos={escolhidos.length}
      nTimes={nTimes}
      viramComplete={viramComplete}
      pendente={pendente}
      acao={acao}
      confirmando={confirmando}
      jogadas={p.jogadas}
      motivoTravado={motivoTravado}
      onSortear={rodarSorteio}
      onDefinir={definir}
      onVoltarDaConfirmacao={() => setConfirmando(false)}
      onVoltarAosSalvos={proposta ? undefined : p.onVoltar}
    />
  );

  return (
    <>
      {p.times.length > 0 && <AtualizarSozinho />}
      <div className={COLUNAS}>
        <div className={ESQUERDA}>
          {temPainel && (
            <SoNo pc>
              <PainelAoLado>{painel(true)}</PainelAoLado>
            </SoNo>
          )}
          {/* No celular, "Quem joga" dá lugar aos times depois de sortear; no PC fica à vista (menos com o Painel aberto). */}
          <div className={!proposta ? 'contents lg:block' : temPainel ? 'hidden' : 'hidden lg:block'}>
            {p.onVoltar && (
              <p className="mt-4 text-base text-apagado lg:mt-0">Os times salvos continuam valendo até você marcar um sorteio novo como definitivo.</p>
            )}
            <BuscaDeJogador
              id="busca-sorteio"
              className={p.onVoltar ? 'mt-6' : 'mt-6 lg:mt-0'}
              rotulo="Pôr mais alguém"
              todos={todos}
              jaEstao={marcados}
              textoJaEsta="Já marcado"
              onEscolher={incluir}
              onCadastrado={(j) => {
                setCadastrados((cs) => [...cs, j]);
                incluir(j);
              }}
            />

            <section aria-labelledby="titulo-quem-joga" className="mt-8">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="titulo-quem-joga" className="font-placa text-2xl font-semibold">
                  Quem joga
                </h2>
                <p className="text-base text-apagado">
                  <span className="font-placa text-subtitulo leading-none font-semibold text-tinta tabular-nums">{escolhidos.length}</span>{' '}
                  {escolhidos.length === 1 ? 'marcado' : 'marcados'}
                </p>
              </div>
              {visiveis.length === 0 ? (
                <p className="mt-3 text-base text-meta">Ninguém confirmou na lista. Busque pelo nome quem está na quadra.</p>
              ) : (
                <ul className="mt-3 flex flex-col gap-2">
                  {visiveis.map((id) => {
                    const j = porId.get(id)!;
                    const marcado = marcados.has(id);
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={marcado}
                          onClick={() => alternar(id)}
                          className={`flex h-toque w-full items-center gap-3 rounded-placa px-4 text-left text-linha font-medium transition-colors ${
                            marcado ? 'bg-placa-alta text-tinta' : 'bg-placa text-apagado hover:bg-placa-alta/60 active:bg-placa-alta'
                          }`}
                        >
                          <span className="min-w-0 flex-1 truncate">{j.nome}</span>
                          <span className="shrink-0 text-base text-meta tabular-nums">
                            <span className="sr-only">nota </span>
                            {formatarNota(j.nota)}
                          </span>
                          <span className={`flex size-8 shrink-0 items-center justify-center rounded-placa text-lima ${marcado ? '' : 'bg-chao'}`}>
                            {marcado && <Marca className="size-6" />}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>

        <div className={`contents ${DIREITA}`}>
          {proposta ? (
            <>
              <Equilibrio
                times={proposta.map(paraSorteado)}
                dica={
                  quemJogaMudou ? (
                    'Quem joga mudou. Sorteie de novo para os times terem quem está marcado.'
                  ) : proposta.some((t) => t.completes.length) ? (
                    'Toque em dois de times diferentes para trocar, ou num COMPLETE para mudar a nota.'
                  ) : (
                    'Toque em dois de times diferentes para trocar.'
                  )
                }
                acao={
                  // No PC "Quem joga" já está à vista, ao lado.
                  <button
                    type="button"
                    className={`-mr-3 lg:hidden ${TEXTO}`}
                    disabled={pendente}
                    onClick={() => {
                      setProposta(null);
                      fecharFolhas();
                      setErro(null);
                    }}
                  >
                    Mudar quem joga
                  </button>
                }
                acaoPc={acoes(true)}
              />
              <SoNo pc>
                <div className="hidden lg:block">
                  <Erro texto={erro} />
                </div>
              </SoNo>
              <GradeDeTimes
                times={proposta}
                selecionado={selecao?.id ?? null}
                completeAberto={aberto ? completeAberto : null}
                animados={troca}
                onToque={(t, j) => tocar(t, j.id)}
                onToqueComplete={(time, chave) => {
                  if (pendente) return;
                  setSelecao(null);
                  setConfirmando(false);
                  setCompleteAberto(completeAberto?.chave === chave ? null : { time, chave });
                }}
                onPorComplete={(time) => {
                  if (pendente) return;
                  const chave = proximaChave.current++;
                  mudarCompletes(time, (cs) => [...cs, { chave, nota: NOTA_DO_COMPLETE_NOVO }]);
                  setSelecao(null);
                  setConfirmando(false);
                  setCompleteAberto({ time, chave });
                }}
              />
            </>
          ) : (
            <SoNo pc>
              <div className="hidden lg:block">
                {acoes(true)}
                <Erro texto={erro} />
                <p className="mt-4 max-w-xl text-base text-apagado">
                  Os times aparecem aqui, equilibrados pela nota. Antes de marcar como definitivo, dá para trocar quem quiser.
                </p>
              </div>
            </SoNo>
          )}
        </div>

        <SoNo pc={false}>
          <Barra folha={temPainel}>
            {painel(false) ?? acoes(false)}
            <Erro texto={erro} />
          </Barra>
        </SoNo>
      </div>
    </>
  );
}

// ---- Depois de definir: mexer nos times entre as partidas -------------------------------

type Escolhido = { id: number; nome: string; de: number | null };

function Definitivo(p: Props & { onRefazer: () => void }) {
  useAutoRefresh(5000);
  const [escolhido, setEscolhido] = useState<Escolhido | null>(null);
  const [completeAberto, setCompleteAberto] = useState<number | null>(null);
  const [escolhendoPara, setEscolhendoPara] = useState<number | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [cadastrados, setCadastrados] = useState<JogadorNota[]>([]);
  const [pendente, startAcao] = useTransition();
  const busca = useTermoDaBusca();
  const notas = useNotasDosCompletes(p.times, setAviso);
  const emTime = new Set(p.times.flatMap((t) => t.jogadores.map((j) => j.id)));
  const todos = [...p.ativos, ...cadastrados.filter((c) => !p.ativos.some((a) => a.id === c.id))];
  const porId = new Map(todos.map((j) => [j.id, j]));
  const corDoTime = new Map(p.times.map((t) => [t.id, t.cor]));
  const times: TimeNaTela[] = p.times.map((t) => ({
    jogadores: t.jogadores,
    completes: t.completes.map((c) => ({ chave: c.id, nota: notas.nota(c) })),
  }));

  /** O COMPLETE pelo id, com o time dele; some se outro admin tirou ou um sorteio novo valeu. */
  function acharComplete(id: number | null) {
    if (id === null) return null;
    for (const [i, t] of p.times.entries()) {
      const c = t.completes.find((x) => x.id === id);
      if (c) return { indice: i, time: t, nota: notas.nota(c) };
    }
    return null;
  }
  const aberto = acharComplete(completeAberto);
  const paraQuem = escolhendoPara === null ? null : acharComplete(escolhendoPara);

  /** Roda uma ação do servidor; `someComplete` = o COMPLETE que ela apaga (a nota dele não vai mais). */
  function executar(fn: () => Promise<{ ok: true } | { ok: false; erro: string }>, aoDar: () => void, someComplete?: number) {
    setAviso(null);
    if (someComplete !== undefined) notas.esquecer(someComplete);
    startAcao(async () => {
      const r = await fn();
      if (r.ok) aoDar();
      else {
        if (someComplete !== undefined) notas.lembrar(someComplete);
        setAviso({ tipo: 'erro', texto: r.erro });
      }
    });
  }

  function levar(para: number | null) {
    if (!escolhido) return;
    const e = escolhido;
    executar(
      () => mover(e.id, e.de, para),
      () => {
        const destino = para === null ? null : NOME_DA_COR[corDoTime.get(para)!];
        const origem = e.de === null ? null : NOME_DA_COR[corDoTime.get(e.de)!];
        setAviso({ tipo: 'ok', texto: destino ? `${e.nome} agora é do ${destino}.` : `${e.nome} saiu do ${origem}.` });
        setEscolhido(null);
      },
    );
  }

  function porNoLugar(j: JogadorNota) {
    if (!paraQuem || escolhendoPara === null) return;
    const id = escolhendoPara;
    const time = NOME_DA_COR[paraQuem.time.cor];
    executar(
      () => preencher(id, j.id),
      () => {
        setAviso({ tipo: 'ok', texto: `${j.nome} entrou no ${time}.` });
        setEscolhendoPara(null);
      },
      id,
    );
  }

  /** Escolher alguém (nos cartões ou na busca) fecha o resto: no PC tudo isso divide a coluna da esquerda. */
  function escolher(e: Escolhido | null) {
    setAviso(null);
    setCompleteAberto(null);
    setEscolhendoPara(null);
    setEscolhido(e);
  }

  const painel = (pc: boolean) =>
    aberto && completeAberto !== null ? (
      <FolhaDoComplete
        pc={pc}
        cor={aberto.time.cor}
        nota={aberto.nota}
        resumo={resumoDoTime(times, aberto.indice)}
        pendente={pendente}
        onPasso={(passo) => notas.mudar(completeAberto, passoDeNota(aberto.nota, passo))}
        onPorAlguem={() => {
          setAviso(null);
          notas.descarregar();
          setEscolhendoPara(completeAberto);
          setCompleteAberto(null);
          window.scrollTo({ top: 0 });
        }}
        onTirar={() => {
          const id = completeAberto;
          const sobram = aberto.time.jogadores.length + aberto.time.completes.length - 1;
          const time = NOME_DA_COR[aberto.time.cor];
          executar(
            () => tirarComplete(id),
            () => {
              setAviso({ tipo: 'ok', texto: `O ${time} agora joga com ${sobram}.` });
              setCompleteAberto(null);
            },
            id,
          );
        }}
        onFechar={() => {
          notas.descarregar();
          setCompleteAberto(null);
        }}
      />
    ) : escolhido ? (
      <LevarEscolhido nome={escolhido.nome} de={escolhido.de} times={p.times} pendente={pendente} onLevar={levar} onCancelar={() => setEscolhido(null)} />
    ) : null;
  const temPainel = !!aberto || !!escolhido;

  const buscaNumTime = {
    rotulo: 'Pôr alguém num time',
    todos,
    jaEstao: emTime,
    textoJaEsta: 'Já tem time',
    ...busca,
    onEscolher: (j: JogadorNota) => escolher({ id: j.id, nome: j.nome, de: null }),
    onCadastrado: (j: JogadorNota) => {
      setCadastrados((cs) => [...cs, j]);
      setCompleteAberto(null);
      setEscolhido({ id: j.id, nome: j.nome, de: null });
    },
  };

  return (
    <div className={COLUNAS}>
      <div className={ESQUERDA}>
        {paraQuem && escolhendoPara !== null ? (
          // No celular, a tela inteira (os times somem); no PC, a coluna da esquerda, com os times à vista.
          <EscolherQuemEntra
            cor={paraQuem.time.cor}
            nota={paraQuem.nota}
            todos={todos}
            emTime={emTime}
            naLista={p.sugeridos.filter((id) => !emTime.has(id)).flatMap((id) => porId.get(id) ?? [])}
            pendente={pendente}
            erro={aviso?.tipo === 'erro' ? aviso.texto : null}
            onEscolher={porNoLugar}
            onCadastrado={(j) => {
              setCadastrados((cs) => [...cs, j]);
              porNoLugar(j);
            }}
            onCancelar={() => {
              setAviso(null);
              setEscolhendoPara(null);
            }}
          />
        ) : (
          <SoNo pc>
            <div className="hidden lg:block">
              {temPainel ? (
                <PainelAoLado>
                  {painel(true)}
                  {aviso && <AvisoDoSorteio aviso={aviso} pc className="mt-3" />}
                </PainelAoLado>
              ) : (
                <>
                  {aviso && <AvisoDoSorteio aviso={aviso} pc className="mb-4" />}
                  <BuscaDeJogador id="busca-definitivo-pc" className="" {...buscaNumTime} />
                  <SortearDeNovo jogadas={p.jogadas} onRefazer={p.onRefazer} className="mt-10" />
                </>
              )}
            </div>
          </SoNo>
        )}
      </div>

      <div className={`${paraQuem ? 'hidden' : 'contents'} ${DIREITA}`}>
        <Equilibrio
          times={times.map(paraSorteado)}
          dica={
            times.some((t) => t.completes.length) ? (
              'Toque num jogador para mudar de time ou num COMPLETE para mexer nele.'
            ) : (
              'Toque num jogador para mudar de time ou tirar.'
            )
          }
        />
        <GradeDeTimes
          times={times}
          cores={p.times.map((t) => t.cor)}
          selecionado={escolhido?.id ?? null}
          completeAberto={aberto ? { time: aberto.indice, chave: completeAberto! } : null}
          onToque={(i, j) => escolher(escolhido?.id === j.id ? null : { id: j.id, nome: j.nome, de: p.times[i].id })}
          onToqueComplete={(_, chave) => {
            setAviso(null);
            setEscolhido(null);
            setEscolhendoPara(null);
            setCompleteAberto(completeAberto === chave ? null : chave);
          }}
          onPorComplete={(i) => {
            if (pendente) return;
            const t = p.times[i];
            escolher(null);
            const nota = formatarNota(NOTA_DO_COMPLETE_NOVO);
            executar(
              () => porComplete(t.id, NOTA_DO_COMPLETE_NOVO),
              () =>
                setAviso({
                  tipo: 'ok',
                  texto: `COMPLETE no ${NOME_DA_COR[t.cor]}, nota ${nota}. Toque nele para mudar.`,
                  textoPc: `COMPLETE no ${NOME_DA_COR[t.cor]}, nota ${nota}. Clique nele para mudar.`,
                }),
            );
          }}
        />
      </div>

      {!paraQuem && (
        <SoNo pc={false}>
          <BuscaDeJogador id="busca-definitivo" className="mt-6 lg:hidden" {...buscaNumTime} />
          <SortearDeNovo jogadas={p.jogadas} onRefazer={p.onRefazer} className="mt-10 pb-8 lg:hidden" />
          {(escolhido || aberto || aviso) && (
            <Barra folha={temPainel}>
              {painel(false)}
              {aviso && <AvisoDoSorteio aviso={aviso} className={temPainel ? 'mt-3' : ''} />}
            </Barra>
          )}
        </SoNo>
      )}
    </div>
  );
}
