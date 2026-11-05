'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type CSSProperties } from 'react';
import { Colete, NOME_DA_COR } from '@/components/colete';
import { SetaEsquerda } from '@/components/icones';
import { PILULA, PILULA_SEGUNDA, TEXTO } from '@/components/pilula';
import { MSG_ALGO_DEU_ERRADO } from '@/domain/mensagens';
import { DURACAO_MS, GOLS_PARA_VENCER, relogio, tempoRestanteMs, type Lado, type Placar, type TipoLance } from '@/domain/partida';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import type { JogadorNaPartida } from '@/server/partidas';
import { anotar, desfazer, encerrar } from './acoes';
import type { EstadoDaPartida } from './estado';

type Lance = { id: number; jogadorId: number; tipo: TipoLance };
/** Um toque ainda sem resposta do servidor. `desfeito`: o Desfazer pegou este toque antes da resposta. */
type Toque = { chave: number; jogadorId: number; tipo: TipoLance; desfeito: boolean; lanceId: Promise<number | null> };

const FALHA = { ok: false, erro: MSG_ALGO_DEU_ERRADO } as const;

const LADOS: Lado[] = ['A', 'B'];
const TEMPO_DO_AVISO_MS = 4000;

/**
 * O anotador ao vivo ("Anotar A"): placar e cronômetro presos em cima, um cartão por jogador com
 * GOL e AST, Desfazer e Encerrar presos embaixo. Cada toque conta na hora (resposta otimista) e o
 * servidor confere em seguida; se ele recusar, o número volta e o erro aparece por alguns segundos.
 */
export function Anotador({ estado: doServidor }: { estado: EstadoDaPartida }) {
  useAutoRefresh(5000);
  const router = useRouter();

  // A leitura mais nova vence: a da página (recarregada a cada 5 s) ou a resposta de um toque.
  const [respondido, setRespondido] = useState(doServidor);
  const atual = doServidor.lidoEm >= respondido.lidoEm ? doServidor : respondido;
  const aceitar = (e: EstadoDaPartida) => setRespondido((r) => (e.lidoEm > r.lidoEm ? e : r));

  const [toques, setToques] = useState<Toque[]>([]);
  /** O lance que o Desfazer está tirando, enquanto o servidor não responde. */
  const [desfazendo, setDesfazendo] = useState<Lance | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [dispensado, setDispensado] = useState<string | null>(null);
  const [encerrando, startEncerrar] = useTransition();
  const sequencia = useRef(0);
  const emVoo = useRef(new Set<Promise<unknown>>());
  /** Chaves dos toques que o Desfazer pegou antes da resposta do servidor. */
  const desfeitos = useRef(new Set<number>());

  const agora = useAgoraDoServidor(doServidor.lidoEm);
  const restante = agora === null ? atual.tempoRestanteMs : tempoRestanteMs(new Date(atual.iniciadaEm), new Date(agora));
  useVibrarNoFim(restante === 0);
  useTelaAcesa(!atual.encerrada);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), TEMPO_DO_AVISO_MS);
    return () => clearTimeout(t);
  }, [aviso]);

  // ---- O que a tela mostra: a leitura do servidor + os toques em voo − o lance sendo desfeito ----
  const ladoDe = new Map<number, Lado>();
  const nomeDe = new Map<number, string>();
  for (const l of LADOS) {
    for (const j of atual.lados[l].jogadores) {
      ladoDe.set(j.id, l);
      nomeDe.set(j.id, j.nome);
    }
  }
  // Enquanto a leitura do servidor ainda traz o lance sendo desfeito, ele já sai da conta.
  const tirando = desfazendo && atual.ultimoLance?.id === desfazendo.id ? desfazendo : null;
  const contando = toques.filter((t) => !t.desfeito);
  const ajuste = (jogadorId: number, tipo: TipoLance) =>
    contando.filter((t) => t.jogadorId === jogadorId && t.tipo === tipo).length -
    (tirando?.jogadorId === jogadorId && tirando.tipo === tipo ? 1 : 0);
  const placar: Placar = { ...atual.placar };
  for (const t of contando) {
    const lado = ladoDe.get(t.jogadorId);
    if (t.tipo === 'gol' && lado) placar[lado]++;
  }
  const ladoTirando = tirando && ladoDe.get(tirando.jogadorId);
  if (tirando?.tipo === 'gol' && ladoTirando) placar[ladoTirando]--;

  // O alvo do Desfazer: o toque mais novo (mesmo sem resposta) ou o último lance do servidor.
  const toqueAlvo = contando.at(-1);
  const lanceAlvo: Pick<Lance, 'jogadorId' | 'tipo'> | null = toqueAlvo ?? (desfazendo ? null : atual.ultimoLance);
  const rotuloAlvo = lanceAlvo && `${lanceAlvo.tipo === 'gol' ? 'gol' : 'assistência'} de ${nomeDe.get(lanceAlvo.jogadorId) ?? '?'}`;

  // Aviso de encerrar: 3 gols vêm antes do tempo. Dispensado vale só para aquele placar.
  const sugestao = atual.encerrada
    ? null
    : placar.A >= GOLS_PARA_VENCER || placar.B >= GOLS_PARA_VENCER
      ? 'tres_gols'
      : restante === 0
        ? 'tempo'
        : null;
  const chaveDoAviso = sugestao && `${sugestao}:${placar.A}x${placar.B}`;
  const mostrarSugestao = chaveDoAviso !== null && chaveDoAviso !== dispensado;

  // ---- Ações ----
  function emSegundoPlano<T>(p: Promise<T>): Promise<T> {
    emVoo.current.add(p);
    p.finally(() => emVoo.current.delete(p)).catch(() => {});
    return p;
  }

  function falhou(erro: string) {
    setAviso({ tipo: 'erro', texto: erro });
    router.refresh();
  }

  function tocar(j: JogadorNaPartida, tipo: TipoLance) {
    navigator.vibrate?.(30);
    setAviso(null);
    const chave = ++sequencia.current;
    const resposta = emSegundoPlano(anotar(atual.id, j.id, tipo).catch(() => FALHA));
    const lanceId = resposta.then((r) => (r.ok ? r.lanceId : null));
    setToques((ts) => [...ts, { chave, jogadorId: j.id, tipo, desfeito: false, lanceId }]);
    resposta.then((r) => {
      // Desfeito antes da resposta: o lance gravado passa a ser o que o Desfazer está tirando.
      if (desfeitos.current.delete(chave) && r.ok) setDesfazendo({ id: r.lanceId, jogadorId: j.id, tipo });
      setToques((ts) => ts.filter((x) => x.chave !== chave));
      if (r.ok) aceitar(r.estado);
      else falhou(r.erro);
    });
  }

  function desfazerUltimo() {
    if (!lanceAlvo || desfazendo) return;
    navigator.vibrate?.(30);
    setAviso(null);
    let alvoId: Promise<number | null>;
    if (toqueAlvo) {
      desfeitos.current.add(toqueAlvo.chave);
      setToques((ts) => ts.map((t) => (t.chave === toqueAlvo.chave ? { ...t, desfeito: true } : t)));
      // Id provisório (negativo): ainda não existe no servidor, então não sai da conta duas vezes.
      setDesfazendo({ id: -toqueAlvo.chave, jogadorId: toqueAlvo.jogadorId, tipo: toqueAlvo.tipo });
      alvoId = toqueAlvo.lanceId;
    } else {
      const ultimo = atual.ultimoLance!;
      setDesfazendo(ultimo);
      alvoId = Promise.resolve(ultimo.id);
    }
    emSegundoPlano(
      alvoId.then(async (id) => {
        if (id === null) return; // o toque não chegou a gravar: não há o que desfazer
        const r = await desfazer(atual.id, id).catch(() => FALHA);
        if (!r.ok) return falhou(r.erro);
        aceitar(r.estado);
        const ultimo = r.estado.ultimoLance;
        if (ultimo && ultimo.id > id) {
          setAviso({ tipo: 'erro', texto: 'Entrou um lance novo antes. Confira o placar e desfaça de novo se precisar.' });
        }
      }),
    ).finally(() => setDesfazendo(null));
  }

  function encerrarAgora() {
    startEncerrar(async () => {
      await Promise.allSettled([...emVoo.current]); // os toques em voo entram antes do resultado
      const r = await encerrar(atual.id).catch(() => FALHA);
      if (r && !r.ok) falhou(r.erro);
    });
  }

  const nomeA = NOME_DA_COR[atual.lados.A.cor];
  const nomeB = NOME_DA_COR[atual.lados.B.cor];
  const fraseDoPlacar =
    placar.A === placar.B
      ? `Empate ${placar.A}×${placar.B}`
      : placar.A > placar.B
        ? `${nomeA} venceu ${placar.A}×${placar.B}`
        : `${nomeB} venceu ${placar.B}×${placar.A}`;

  return (
    <main className="fixed inset-0 z-10 flex justify-center bg-chao">
      <div className="flex h-full w-full max-w-md flex-col">
        {/* ---- Topo preso: cronômetro, barra do tempo e placar ---- */}
        <header className="shrink-0 px-4 pt-1">
          <div className="grid grid-cols-[3rem_1fr_3rem] items-center">
            <Link
              href="/admin/partidas"
              className="-ml-3 flex size-12 items-center justify-center rounded-placa text-apagado transition-colors hover:text-tinta"
            >
              <SetaEsquerda className="size-6" />
              <span className="sr-only">Voltar para partidas</span>
            </Link>
            <p className="text-center font-placa text-numero font-semibold tabular-nums" role="timer">
              {relogio(restante)}
            </p>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-placa-alta" aria-hidden="true">
            <div
              className="h-full origin-left rounded-full bg-tinta transition-transform duration-500 ease-linear"
              style={{ transform: `scaleX(${1 - restante / DURACAO_MS})` }}
            />
          </div>
          <h1 className="sr-only">
            Partida {nomeA} × {nomeB}
          </h1>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3" aria-live="polite">
            {LADOS.map((l) => {
              const cor = atual.lados[l].cor;
              return (
                <div key={l} className={`flex h-20 min-w-0 items-center gap-2 pl-1.5 ${l === 'B' ? 'order-3 flex-row-reverse pr-1.5 pl-0' : ''}`}>
                  <Colete cor={cor} />
                  <span className={`min-w-0 flex-1 truncate text-base font-semibold text-tinta ${l === 'B' ? 'text-right' : ''}`}>
                    {NOME_DA_COR[cor]}
                  </span>
                  <span data-testid={`gols-${l}`} className="font-placa text-placar font-semibold tabular-nums">
                    <span className="sr-only">{NOME_DA_COR[cor]} </span>
                    {placar[l]}
                  </span>
                </div>
              );
            })}
            <span aria-hidden="true" className="order-2 font-placa text-subtitulo font-semibold text-meta">
              ×
            </span>
          </div>
        </header>

        {/* ---- Os jogadores: duas colunas, uma por time (na ordem do placar) ---- */}
        {atual.encerrada ? (
          <Encerrada estado={atual} frase={fraseDoPlacar} />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-3">
            <div
              className="grid grid-cols-2 items-start gap-2"
              style={{ '--linhas': Math.max(atual.lados.A.jogadores.length, atual.lados.B.jogadores.length, 1) } as CSSProperties}
            >
              {LADOS.map((l) => (
                <ul key={l} aria-label={NOME_DA_COR[atual.lados[l].cor]} className="flex flex-col gap-2">
                  {atual.lados[l].jogadores.map((j) => (
                    <CartaoDoJogador
                      key={j.id}
                      jogador={j}
                      gols={j.gols + ajuste(j.id, 'gol')}
                      assistencias={j.assistencias + ajuste(j.id, 'assistencia')}
                      salvando={contando.some((t) => t.jogadorId === j.id)}
                      desabilitado={encerrando}
                      onToque={(tipo) => tocar(j, tipo)}
                    />
                  ))}
                </ul>
              ))}
            </div>
          </div>
        )}

        {/* ---- Embaixo, preso: Desfazer e Encerrar, ou a pergunta de encerrar ---- */}
        {!atual.encerrada && (
          <footer
            className={`shrink-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] ${
              mostrarSugestao || confirmando ? 'rounded-t-cartao bg-placa shadow-[0_-12px_32px_rgba(0,0,0,0.7)]' : 'bg-chao'
            }`}
          >
            {aviso && (
              <p role={aviso.tipo === 'erro' ? 'alert' : 'status'} className={`mb-3 text-base font-medium ${aviso.tipo === 'erro' ? 'text-erro' : 'text-lima'}`}>
                {aviso.texto}
              </p>
            )}
            {mostrarSugestao || confirmando ? (
              <div role="status">
                <p className="font-placa text-subtitulo font-semibold">
                  {mostrarSugestao ? (
                    <>
                      {sugestao === 'tempo' && 'Acabou o tempo. '}
                      {fraseDoPlacar} — encerrar?
                    </>
                  ) : (
                    <>
                      Encerrar com {nomeA} {placar.A}×{placar.B} {nomeB}?
                    </>
                  )}
                </p>
                <p className="mt-1 text-base text-apagado">Depois de encerrar, só dá para mudar em Corrigir.</p>
                <button type="button" className={`mt-3 ${PILULA}`} disabled={encerrando} onClick={encerrarAgora}>
                  {encerrando ? 'Encerrando…' : 'Encerrar partida'}
                </button>
                <div className="mt-2 flex items-center gap-2">
                  {mostrarSugestao && (
                    <BotaoDesfazer alvo={rotuloAlvo} ocupado={desfazendo !== null || encerrando} onClick={desfazerUltimo} />
                  )}
                  <button
                    type="button"
                    className={`${TEXTO} shrink-0 ${mostrarSugestao ? '' : 'w-full'}`}
                    disabled={encerrando}
                    onClick={() => {
                      setConfirmando(false);
                      if (mostrarSugestao) setDispensado(chaveDoAviso);
                    }}
                  >
                    {mostrarSugestao ? 'Continuar jogando' : 'Voltar'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <BotaoDesfazer alvo={rotuloAlvo} ocupado={desfazendo !== null} onClick={desfazerUltimo} />
                <button type="button" className={`${PILULA_SEGUNDA} basis-2/5`} onClick={() => setConfirmando(true)}>
                  Encerrar
                </button>
              </div>
            )}
          </footer>
        )}
      </div>
    </main>
  );
}

/** Cartão de um jogador: nome, os números dele nesta partida e os dois botões. */
function CartaoDoJogador({
  jogador,
  gols,
  assistencias,
  salvando,
  desabilitado,
  onToque,
}: {
  jogador: JogadorNaPartida;
  gols: number;
  assistencias: number;
  salvando: boolean;
  desabilitado: boolean;
  onToque: (tipo: TipoLance) => void;
}) {
  return (
    // Os botões crescem até 72px quando sobra altura (4 contra 4 num celular comum) e nunca ficam
    // abaixo de 56px; a conta tira da tela o topo, a barra de baixo e o resto de cada cartão.
    <li className="rounded-placa bg-placa p-1.5 [--botao:clamp(3.5rem,calc((100dvh-16rem)/var(--linhas)-4.5rem),4.5rem)]">
      <div className="px-1.5 pt-0.5">
        <p className="truncate text-base font-medium text-tinta">{jogador.nome}</p>
        <p className="text-sm text-meta tabular-nums">
          <Numero n={gols} salvando={salvando} /> {gols === 1 ? 'gol' : 'gols'} · <Numero n={assistencias} salvando={salvando} /> ast
        </p>
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="button"
          disabled={desabilitado}
          onClick={() => onToque('gol')}
          className="h-(--botao) flex-[3] touch-manipulation rounded-placa bg-tinta text-linha font-semibold text-chao transition-colors select-none active:bg-meta"
        >
          GOL<span className="sr-only"> de {jogador.nome}</span>
        </button>
        <button
          type="button"
          disabled={desabilitado}
          onClick={() => onToque('assistencia')}
          className="h-(--botao) flex-[2] touch-manipulation rounded-placa bg-placa-alta text-base font-semibold text-tinta transition-colors select-none active:bg-meta/60"
        >
          AST<span className="sr-only"> (assistência) de {jogador.nome}</span>
        </button>
      </div>
    </li>
  );
}

/** Número do cartão: entra com o passo de pendurar; lima enquanto o toque está sendo salvo. */
function Numero({ n, salvando }: { n: number; salvando: boolean }) {
  return (
    <span key={n} className={`inline-block font-semibold ${n > 0 ? 'animate-pendurar' : ''} ${salvando ? 'text-lima' : n > 0 ? 'text-tinta' : ''}`}>
      {n}
    </span>
  );
}

function BotaoDesfazer({ alvo, ocupado, onClick }: { alvo: string | null; ocupado: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={!alvo || ocupado}
      onClick={onClick}
      aria-label={alvo ? `Desfazer: ${alvo}` : 'Desfazer: nada para desfazer'}
      className="flex h-toque min-w-0 flex-1 flex-col items-center justify-center rounded-full bg-placa-alta px-4 leading-tight text-tinta transition-colors hover:bg-meta/40 active:bg-meta/60 disabled:text-meta"
    >
      <span className="text-base font-semibold">{ocupado && alvo ? 'Desfazendo…' : 'Desfazer'}</span>
      <span className="w-full truncate text-center text-sm text-apagado">{alvo ?? 'nada para desfazer'}</span>
    </button>
  );
}

/** Partida já encerrada (aqui ou por outro admin): o resultado e o caminho para corrigir. */
function Encerrada({ estado, frase }: { estado: EstadoDaPartida; frase: string }) {
  return (
    <div className="flex flex-1 flex-col px-4 pt-6">
      <h2 className="font-placa text-subtitulo font-semibold">Partida encerrada</h2>
      <p className="mt-1 text-linha text-apagado">{frase}</p>
      <div className="mt-6 flex flex-col gap-2">
        <Link href="/admin/partidas" className={PILULA}>
          Ver partidas
        </Link>
        <Link href={`/admin/partida/${estado.id}/corrigir`} className={PILULA_SEGUNDA}>
          Corrigir
        </Link>
      </div>
    </div>
  );
}

// ---- Relógio, vibração e tela acesa ----

/**
 * A hora do servidor, andando no relógio do aparelho: o desvio é medido uma vez, na primeira
 * leitura, para um celular com o relógio errado não adiantar nem atrasar o cronômetro.
 * `null` até montar (no HTML do servidor vale o tempo que veio pronto).
 */
function useAgoraDoServidor(lidoEmInicial: number): number | null {
  const [lidoEm] = useState(lidoEmInicial);
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => {
    const desvio = lidoEm - Date.now();
    const tique = () => setAgora(Date.now() + desvio);
    tique();
    const t = setInterval(tique, 250);
    return () => clearInterval(t);
  }, [lidoEm]);
  return agora;
}

/** Vibração longa quando o cronômetro chega a 0:00 com a tela aberta (uma vez). */
function useVibrarNoFim(acabou: boolean) {
  const antes = useRef(acabou);
  useEffect(() => {
    if (acabou && !antes.current) navigator.vibrate?.([200, 100, 200]);
    antes.current = acabou;
  }, [acabou]);
}

/** Wake Lock: a tela não apaga enquanto a partida está aberta. O navegador solta ao trocar de aba; pede de novo na volta. */
function useTelaAcesa(ligada: boolean) {
  useEffect(() => {
    if (!ligada || !navigator.wakeLock) return;
    let trava: WakeLockSentinel | null = null;
    let ativa = true;
    const pedir = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const nova = await navigator.wakeLock.request('screen');
        if (ativa) trava = nova;
        else await nova.release();
      } catch {
        // Sem permissão ou sem bateria: segue sem travar a tela.
      }
    };
    pedir();
    document.addEventListener('visibilitychange', pedir);
    return () => {
      ativa = false;
      document.removeEventListener('visibilitychange', pedir);
      trava?.release().catch(() => {});
    };
  }, [ligada]);
}
