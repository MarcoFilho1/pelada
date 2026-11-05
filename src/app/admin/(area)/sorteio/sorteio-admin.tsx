'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { Colete, NOME_DA_COR } from '@/components/colete';
import { Marca, Mais } from '@/components/icones';
import { PILULA, PILULA_SEGUNDA, TEXTO } from '@/components/pilula';
import { CORES, formatarNota, rotuloDaDiferenca, type Cor, type JogadorNota, type TimeSorteado } from '@/domain/sorteio';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import type { TimeDaPelada } from '@/server/times';
import { marcarDefinitivo, mover, porComplete, preencher, sortear, tirarComplete } from './acoes';
import { BuscaDeJogador, Erro } from './busca-de-jogador';
import { EscolherQuemEntra, FolhaDoComplete, NOTA_DO_COMPLETE_NOVO, useNotasDosCompletes } from './complete';

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

/** Vagas por time: o sorteio completa até aqui com COMPLETE. */
const VAGAS = 4;

/** Um COMPLETE no cartão: `chave` é o id salvo (definitivo) ou um número local (proposta). */
type CompleteNaTela = { chave: number; nota: number };
type TimeNaTela = { jogadores: JogadorNota[]; completes: CompleteNaTela[] };

const somar = (t: TimeNaTela) => t.jogadores.reduce((s, j) => s + j.nota, 0) + t.completes.reduce((s, c) => s + c.nota, 0);
const paraSorteado = (t: TimeNaTela): TimeSorteado => ({ jogadores: t.jogadores, completes: t.completes.map((c) => c.nota), soma: somar(t) });
const vagas = (t: TimeNaTela) => t.jogadores.length + t.completes.length;
const passoDeNota = (nota: number, passo: number) => Math.min(5, Math.max(0, nota + passo));

/** O que a nota do COMPLETE muda, dito na folha (ela cobre os cartões e a diferença no celular). */
function resumoDoTime(times: TimeNaTela[], indice: number) {
  return `Soma ${formatarNota(somar(times[indice]))} · ${rotuloDaDiferenca(times.map(paraSorteado))}`;
}

/** A consequência de marcar um sorteio novo depois de partidas jogadas. */
function fraseDasJogadas(n: number) {
  return n === 1
    ? 'A partida já jogada fica como está. Os times novos valem daqui pra frente.'
    : `As ${n} partidas já jogadas ficam como estão. Os times novos valem daqui pra frente.`;
}

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
type CompleteEscolhido = { time: number; chave: number };

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

  function alternar(id: number) {
    setMarcados((m) => {
      const novo = new Set(m);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function incluir(j: JogadorNota) {
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

  if (proposta) {
    const aberto = completeAberto && proposta[completeAberto.time]?.completes.find((c) => c.chave === completeAberto.chave);
    const selecionado = selecao ? porId.get(selecao.id) : undefined;
    const motivoTravado = p.emAndamento !== null ? 'Tem partida em andamento. Encerre no anotador para marcar os times novos.' : null;
    return (
      <>
        {p.times.length > 0 && <AtualizarSozinho />}
        <Equilibrio
          times={proposta.map(paraSorteado)}
          dica={
            proposta.some((t) => t.completes.length)
              ? 'Toque em dois de times diferentes para trocar, ou num COMPLETE para mudar a nota.'
              : 'Toque em dois de times diferentes para trocar.'
          }
          acao={
            <button
              type="button"
              className={`-mr-3 ${TEXTO}`}
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
        />
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
        <Barra folha={!!selecionado || !!aberto}>
          {aberto && completeAberto ? (
            <FolhaDoComplete
              cor={CORES[completeAberto.time]}
              nota={aberto.nota}
              resumo={resumoDoTime(proposta, completeAberto.time)}
              pendente={pendente}
              onPasso={(passo) =>
                mudarCompletes(completeAberto.time, (cs) =>
                  cs.map((c) => (c.chave === aberto.chave ? { ...c, nota: passoDeNota(c.nota, passo) } : c)),
                )
              }
              onTirar={() => {
                mudarCompletes(completeAberto.time, (cs) => cs.filter((c) => c.chave !== aberto.chave));
                setCompleteAberto(null);
              }}
              onFechar={() => setCompleteAberto(null)}
            />
          ) : selecionado ? (
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-base text-apagado">
                <span className="block truncate text-linha font-medium text-tinta">Trocar {selecionado.nome}</span>
                com alguém de outro time
              </p>
              <button type="button" className={`-mr-3 ${TEXTO}`} onClick={() => setSelecao(null)}>
                Cancelar
              </button>
            </div>
          ) : confirmando ? (
            <div className="rounded-placa bg-placa-alta p-4">
              <p className="text-base font-medium text-tinta">{fraseDasJogadas(p.jogadas)}</p>
              <button
                type="button"
                className={`mt-4 ${PILULA}`}
                disabled={pendente || motivoTravado !== null}
                aria-describedby={motivoTravado ? 'motivo-travado' : undefined}
                onClick={definir}
              >
                {acao === 'definir' ? 'Salvando…' : 'Usar os times novos'}
              </button>
              {motivoTravado && (
                <p id="motivo-travado" className="mt-2 text-base text-apagado">
                  {motivoTravado}
                </p>
              )}
              <button type="button" className={`mx-auto mt-1 ${TEXTO}`} disabled={pendente} onClick={() => setConfirmando(false)}>
                Voltar
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                className={PILULA}
                disabled={pendente || motivoTravado !== null}
                aria-describedby={motivoTravado ? 'motivo-travado' : undefined}
                onClick={definir}
              >
                {acao === 'definir' ? 'Salvando…' : 'Marcar como definitivo'}
              </button>
              {motivoTravado && (
                <p id="motivo-travado" className="text-base text-apagado">
                  {motivoTravado}
                </p>
              )}
              <button type="button" className={PILULA_SEGUNDA} disabled={pendente} onClick={rodarSorteio}>
                {acao === 'sortear' ? 'Sorteando…' : 'Sortear de novo'}
              </button>
            </div>
          )}
          <Erro texto={erro} />
        </Barra>
      </>
    );
  }

  return (
    <>
      {p.times.length > 0 && <AtualizarSozinho />}
      {p.onVoltar && (
        <p className="mt-4 text-base text-apagado">
          Os times salvos continuam valendo até você marcar um sorteio novo como definitivo.
        </p>
      )}
      <BuscaDeJogador
        id="busca-sorteio"
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

      <Barra>
        <button type="button" className={PILULA} disabled={pendente || escolhidos.length < 2} onClick={rodarSorteio}>
          {acao === 'sortear'
            ? 'Sorteando…'
            : escolhidos.length < 2
              ? 'Marque pelo menos 2'
              : `Sortear ${escolhidos.length} em ${nTimes} times`}
        </button>
        {escolhidos.length >= 2 && viramComplete > 0 && (
          <p className="mt-2 text-center text-base text-meta">
            {viramComplete === 1 ? '1 vaga vira COMPLETE.' : `${viramComplete} vagas viram COMPLETE.`}
          </p>
        )}
        {p.onVoltar && (
          <button type="button" className={`mx-auto mt-1 ${TEXTO}`} disabled={pendente} onClick={p.onVoltar}>
            Voltar aos times salvos
          </button>
        )}
        <Erro texto={erro} />
      </Barra>
    </>
  );
}

// ---- Depois de definir: mexer nos times entre as partidas -------------------------------

type Escolhido = { id: number; nome: string; de: number | null };
type Aviso = { tipo: 'ok' | 'erro'; texto: string };

function Definitivo(p: Props & { onRefazer: () => void }) {
  useAutoRefresh(5000);
  const [escolhido, setEscolhido] = useState<Escolhido | null>(null);
  const [completeAberto, setCompleteAberto] = useState<number | null>(null);
  const [escolhendoPara, setEscolhendoPara] = useState<number | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [cadastrados, setCadastrados] = useState<JogadorNota[]>([]);
  const [pendente, startAcao] = useTransition();
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
  const paraQuem = acharComplete(escolhendoPara);

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

  if (paraQuem && escolhendoPara !== null) {
    const naLista = p.sugeridos.filter((id) => !emTime.has(id)).flatMap((id) => porId.get(id) ?? []);
    return (
      <EscolherQuemEntra
        cor={paraQuem.time.cor}
        nota={paraQuem.nota}
        todos={todos}
        emTime={emTime}
        naLista={naLista}
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
    );
  }

  return (
    <>
      <Equilibrio
        times={times.map(paraSorteado)}
        dica={
          times.some((t) => t.completes.length)
            ? 'Toque num jogador para mudar de time ou num COMPLETE para mexer nele.'
            : 'Toque num jogador para mudar de time ou tirar.'
        }
      />
      <GradeDeTimes
        times={times}
        cores={p.times.map((t) => t.cor)}
        selecionado={escolhido?.id ?? null}
        completeAberto={aberto ? { time: aberto.indice, chave: completeAberto! } : null}
        onToque={(i, j) => {
          setAviso(null);
          setCompleteAberto(null);
          setEscolhido(escolhido?.id === j.id ? null : { id: j.id, nome: j.nome, de: p.times[i].id });
        }}
        onToqueComplete={(_, chave) => {
          setAviso(null);
          setEscolhido(null);
          setCompleteAberto(completeAberto === chave ? null : chave);
        }}
        onPorComplete={(i) => {
          if (pendente) return;
          const t = p.times[i];
          setEscolhido(null);
          setCompleteAberto(null);
          executar(
            () => porComplete(t.id, NOTA_DO_COMPLETE_NOVO),
            () =>
              setAviso({
                tipo: 'ok',
                texto: `COMPLETE no ${NOME_DA_COR[t.cor]}, nota ${formatarNota(NOTA_DO_COMPLETE_NOVO)}. Toque nele para mudar.`,
              }),
          );
        }}
      />

      <BuscaDeJogador
        id="busca-definitivo"
        rotulo="Pôr alguém num time"
        todos={todos}
        jaEstao={emTime}
        textoJaEsta="Já tem time"
        onEscolher={(j) => {
          setAviso(null);
          setCompleteAberto(null);
          setEscolhido({ id: j.id, nome: j.nome, de: null });
        }}
        onCadastrado={(j) => {
          setCadastrados((cs) => [...cs, j]);
          setCompleteAberto(null);
          setEscolhido({ id: j.id, nome: j.nome, de: null });
        }}
      />

      <section aria-label="Sortear de novo" className="mt-10 pb-8">
        <button type="button" className={PILULA_SEGUNDA} onClick={p.onRefazer}>
          Sortear de novo
        </button>
        <p className="mt-2 text-base text-meta">
          {p.jogadas > 0
            ? 'Os times salvos só mudam quando você marcar o novo sorteio como definitivo. As partidas já jogadas não mudam.'
            : 'Os times salvos só mudam quando você marcar o novo sorteio como definitivo.'}
        </p>
      </section>

      {(escolhido || aberto || aviso) && (
        <Barra folha={!!escolhido || !!aberto}>
          {aberto && completeAberto !== null ? (
            <FolhaDoComplete
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
          ) : (
            escolhido && (
              <div>
                <div className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 truncate text-linha font-medium text-tinta">
                    {escolhido.de === null ? `Pôr ${escolhido.nome} no` : `Levar ${escolhido.nome} para`}
                  </p>
                  <button type="button" className={`-mr-3 ${TEXTO}`} disabled={pendente} onClick={() => setEscolhido(null)}>
                    Cancelar
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {p.times
                    .filter((t) => t.id !== escolhido.de)
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        disabled={pendente}
                        onClick={() => levar(t.id)}
                        className="flex h-toque items-center gap-3 rounded-placa bg-placa-alta px-4 text-left text-linha font-medium text-tinta transition-colors hover:bg-meta/40 active:bg-meta/60 disabled:text-meta"
                      >
                        <Colete cor={t.cor} />
                        {NOME_DA_COR[t.cor]}
                      </button>
                    ))}
                </div>
                {escolhido.de !== null && (
                  <button type="button" className={`mt-2 ${PILULA_SEGUNDA}`} disabled={pendente} onClick={() => levar(null)}>
                    Tirar do time
                  </button>
                )}
              </div>
            )
          )}
          {aviso && (
            <p
              role={aviso.tipo === 'erro' ? 'alert' : 'status'}
              className={`text-base font-medium ${aviso.tipo === 'erro' ? 'text-erro' : 'text-lima'} ${escolhido || aberto ? 'mt-3' : ''}`}
            >
              {aviso.texto}
            </p>
          )}
        </Barra>
      )}
    </>
  );
}

// ---- Peças -------------------------------------------------------------------------------

/**
 * A diferença de força dita com todas as letras (soma, ou média por jogador se os tamanhos diferem), o que dá para fazer
 * nos cartões e, à direita, uma ação de texto opcional.
 */
function Equilibrio({ times, dica, acao }: { times: TimeSorteado[]; dica: string; acao?: ReactNode }) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-placa text-subtitulo font-semibold tabular-nums">{rotuloDaDiferenca(times)}</p>
        {acao}
      </div>
      <p className="mt-1 text-base text-meta">{dica}</p>
    </div>
  );
}

/**
 * Os cartões dos times. O COMPLETE é uma vaga: um buraco na placa (fundo do chão), com a nota que
 * conta na soma. Time com menos de 4 ganha "COMPLETE" com um mais, para pôr uma vaga.
 */
function GradeDeTimes({
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
      <div className="grid grid-cols-2 gap-2">
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
 * Barra de baixo, presa no rodapé da tela: as ações ficam no alcance do polegar. `folha` = a
 * pergunta de um jogador ou COMPLETE escolhido: sobe em placa com sombra, porque flutua sobre os times.
 */
function Barra({ children, folha = false }: { children: ReactNode; folha?: boolean }) {
  return (
    <div
      className={`sticky bottom-0 mt-auto ${
        folha ? '-mx-3 rounded-t-cartao bg-placa px-4 pt-3 pb-4 shadow-[0_-12px_32px_rgba(0,0,0,0.7)]' : '-mx-5 bg-chao px-5 pt-3 pb-4'
      }`}
    >
      {children}
    </div>
  );
}
