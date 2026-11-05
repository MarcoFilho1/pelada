'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type CSSProperties } from 'react';
import { Colete, NOME_DA_COR } from '@/components/colete';
import { SetaEsquerda } from '@/components/icones';
import { PILULA, PILULA_SEGUNDA, TEXTO } from '@/components/pilula';
import { MSG_ALGO_DEU_ERRADO } from '@/domain/mensagens';
import { DURACAO_MS, GOLS_PARA_VENCER, relogio, type Lado, type TipoLance } from '@/domain/partida';
import { bipar, destravarAudio } from '@/lib/bipe';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import type { JogadorNaPartida } from '@/server/partidas';
import { anotar, desfazer, encerrar } from './acoes';
import { Anotacoes, tempoNaTela } from './anotador-estado';
import type { EstadoDaPartida } from './estado';

const LADOS: Lado[] = ['A', 'B'];
const TEMPO_DO_AVISO_MS = 4000;

/**
 * O anotador ao vivo ("Anotar A"): placar e cronômetro presos em cima, um cartão por jogador com
 * GOL e AST, Desfazer e Encerrar presos embaixo. Cada toque conta na hora (resposta otimista) e vai
 * para a fila de escritas (`anotador-estado.ts`), que fala com o servidor na ordem dos toques; se
 * ele recusar, o número volta e o erro aparece por alguns segundos.
 */
export function Anotador({ estado: doServidor }: { estado: EstadoDaPartida }) {
  useAutoRefresh(5000);
  const router = useRouter();
  const [fila] = useState(
    () =>
      new Anotacoes(doServidor, {
        anotar: (jogadorId, tipo) => anotar(doServidor.id, jogadorId, tipo),
        desfazer: (esperadoId) => desfazer(doServidor.id, esperadoId),
      }),
  );
  useEffect(() => fila.receberDaPagina(doServidor), [fila, doServidor]);
  const v = useSyncExternalStore(fila.assinar, fila.instantaneo, fila.instantaneo);
  const atual = v.estado;
  const placar = v.placar;

  const [confirmando, setConfirmando] = useState(false);
  const [dispensado, setDispensado] = useState<string | null>(null);
  const [erroAoEncerrar, setErroAoEncerrar] = useState<string | null>(null);
  const [encerrando, startEncerrar] = useTransition();

  const agora = useAgoraDoServidor(doServidor.lidoEm);
  const restante = tempoNaTela(atual, agora);
  useVibrarNoFim(!atual.encerrada && restante === 0);
  useTelaAcesa(!atual.encerrada);

  // Erro da fila: fica 4 s e a página é lida de novo (o servidor pode ter mudado, ex.: encerrada).
  const aviso = v.aviso;
  useEffect(() => {
    if (!aviso) return;
    router.refresh();
    const t = setTimeout(() => fila.limparAviso(aviso.n), TEMPO_DO_AVISO_MS);
    return () => clearTimeout(t);
  }, [aviso, fila, router]);
  useEffect(() => {
    if (!erroAoEncerrar) return;
    const t = setTimeout(() => setErroAoEncerrar(null), TEMPO_DO_AVISO_MS);
    return () => clearTimeout(t);
  }, [erroAoEncerrar]);
  const textoDoErro = erroAoEncerrar ?? aviso?.texto ?? null;

  const nomeDe = new Map<number, string>();
  for (const l of LADOS) for (const j of atual.lados[l].jogadores) nomeDe.set(j.id, j.nome);
  const rotuloAlvo = v.alvo && `${v.alvo.tipo === 'gol' ? 'gol' : 'assistência'} de ${nomeDe.get(v.alvo.jogadorId) ?? '?'}`;

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
  useBipeNaSugestao(sugestao === 'tres_gols' ? chaveDoAviso : null);

  function tocar(j: JogadorNaPartida, tipo: TipoLance) {
    destravarAudio();
    navigator.vibrate?.(30);
    setErroAoEncerrar(null);
    fila.tocar(j.id, tipo);
  }

  function desfazerUltimo() {
    destravarAudio();
    navigator.vibrate?.(30);
    setErroAoEncerrar(null);
    fila.desfazer();
  }

  function encerrarAgora() {
    startEncerrar(async () => {
      await fila.ocioso(); // os toques e desfazer da fila entram antes do resultado
      const r = await encerrar(atual.id).catch(() => ({ ok: false as const, erro: MSG_ALGO_DEU_ERRADO }));
      if (r && !r.ok) {
        setErroAoEncerrar(r.erro);
        router.refresh();
      }
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
            <p className="text-center font-placa text-numero font-semibold tabular-nums baixa:text-titulo" role="timer">
              {relogio(restante)}
            </p>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-placa-alta baixa:mt-0.5" aria-hidden="true">
            <div
              className="h-full origin-left rounded-full bg-tinta transition-transform duration-500 ease-linear"
              style={{ transform: `scaleX(${1 - restante / DURACAO_MS})` }}
            />
          </div>
          <h1 className="sr-only">
            Partida {nomeA} × {nomeB}
          </h1>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 baixa:mt-1" aria-live="polite">
            {LADOS.map((l) => {
              const cor = atual.lados[l].cor;
              return (
                <div key={l} className={`flex h-20 min-w-0 items-center gap-2 pl-1.5 baixa:h-14 ${l === 'B' ? 'order-3 flex-row-reverse pr-1.5 pl-0' : ''}`}>
                  <Colete cor={cor} />
                  <span className={`min-w-0 flex-1 truncate text-base font-semibold text-tinta ${l === 'B' ? 'text-right' : ''}`}>
                    {NOME_DA_COR[cor]}
                  </span>
                  <span data-testid={`gols-${l}`} className="font-placa text-placar font-semibold tabular-nums baixa:text-placar-baixo">
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
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-3 baixa:pt-1.5 baixa:pb-2">
            <div
              className="grid grid-cols-2 items-start gap-2 baixa:gap-1.5"
              style={{ '--linhas': Math.max(atual.lados.A.jogadores.length, atual.lados.B.jogadores.length, 1) } as CSSProperties}
            >
              {LADOS.map((l) => (
                <ul key={l} aria-label={NOME_DA_COR[atual.lados[l].cor]} className="flex flex-col gap-2 baixa:gap-1.5">
                  {atual.lados[l].jogadores.map((j) => (
                    <CartaoDoJogador
                      key={j.id}
                      jogador={j}
                      gols={v.conta(j.id, 'gol')}
                      assistencias={v.conta(j.id, 'assistencia')}
                      salvando={v.salvando.has(j.id)}
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
            className={`relative shrink-0 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] baixa:pt-2 baixa:pb-[max(0.75rem,env(safe-area-inset-bottom))] ${
              mostrarSugestao || confirmando ? 'rounded-t-cartao bg-placa shadow-[0_-12px_32px_rgba(0,0,0,0.7)]' : 'bg-chao'
            }`}
          >
            {/* Faixa sobre a lista, sem empurrar nada (4 contra 4 segue sem rolar) e sem pegar toque. */}
            {!textoDoErro && v.lento && (
              <p
                role="status"
                className="pointer-events-none absolute inset-x-4 bottom-full mb-2 rounded-placa bg-placa-alta px-3 py-2 text-base font-medium text-tinta shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
              >
                Salvando há mais de 10 s — confira a conexão.
              </p>
            )}
            {textoDoErro && (
              <p role="alert" className="mb-3 text-base font-medium text-erro">
                {textoDoErro}
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
                <button type="button" className={`mt-3 ${PILULA} baixa:mt-2 baixa:h-12`} disabled={encerrando} onClick={encerrarAgora}>
                  {encerrando ? 'Encerrando…' : 'Encerrar partida'}
                </button>
                <div className="mt-2 flex items-center gap-2">
                  {mostrarSugestao && (
                    <BotaoDesfazer alvo={rotuloAlvo} desfazendo={v.desfazendo} desabilitado={encerrando} onClick={desfazerUltimo} />
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
                <BotaoDesfazer alvo={rotuloAlvo} desfazendo={v.desfazendo} desabilitado={false} onClick={desfazerUltimo} />
                <button type="button" className={`${PILULA_SEGUNDA} basis-2/5 baixa:h-12`} onClick={() => setConfirmando(true)}>
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
    // Os botões crescem até 72px quando sobra altura e encolhem com a tela: a conta tira da altura
    // visível o topo, a barra de baixo e o resto de cada cartão. Tela alta: de 56px a 72px. Tela
    // baixa (navegador de um celular comum, ≤ 760px): o topo e o cartão apertam e o botão vai até
    // 48px, para 4 contra 4 caber sem rolar em 360×640.
    <li className="rounded-placa bg-placa p-1.5 [--botao:clamp(3.5rem,calc((100dvh-16rem)/var(--linhas)-4.5rem),4.5rem)] baixa:p-1 baixa:[--botao:clamp(3rem,calc((100dvh-13rem)/var(--linhas)-3.375rem),4.5rem)]">
      <div className="px-1.5 pt-0.5 baixa:pt-0">
        <p className="truncate text-base font-medium text-tinta baixa:leading-5">{jogador.nome}</p>
        <p className="text-sm text-meta tabular-nums baixa:leading-4">
          <Numero n={gols} salvando={salvando} /> {gols === 1 ? 'gol' : 'gols'} · <Numero n={assistencias} salvando={salvando} /> ast
        </p>
      </div>
      <div className="mt-1.5 flex gap-1.5 baixa:mt-1">
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

/**
 * Desfazer: diz o que vai sair ("gol de Pepe"). Com Desfazer na fila mostra "Desfazendo…" e continua
 * tocável: cada toque enfileira mais um, sempre o último que a tela mostra.
 */
function BotaoDesfazer({
  alvo,
  desfazendo,
  desabilitado,
  onClick,
}: {
  alvo: string | null;
  desfazendo: boolean;
  desabilitado: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!alvo || desabilitado}
      onClick={onClick}
      aria-label={`${desfazendo ? 'Desfazendo…' : 'Desfazer'}: ${alvo ?? 'nada para desfazer'}`}
      className="flex h-toque min-w-0 flex-1 flex-col items-center justify-center rounded-full baixa:h-12 bg-placa-alta px-4 leading-tight text-tinta transition-colors hover:bg-meta/40 active:bg-meta/60 disabled:text-meta"
    >
      <span className="text-base font-semibold">{desfazendo ? 'Desfazendo…' : 'Desfazer'}</span>
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

/** Vibração longa e bipe quando o cronômetro chega a 0:00 com a tela aberta (uma vez). */
function useVibrarNoFim(acabou: boolean) {
  const antes = useRef(acabou);
  useEffect(() => {
    if (acabou && !antes.current) {
      navigator.vibrate?.([200, 100, 200]);
      bipar();
    }
    antes.current = acabou;
  }, [acabou]);
}

/** Bipe quando o aviso do 3º gol aparece (cada placar novo com 3 gols, uma vez). */
function useBipeNaSugestao(chave: string | null) {
  const antes = useRef(chave);
  useEffect(() => {
    if (chave && chave !== antes.current) bipar();
    antes.current = chave;
  }, [chave]);
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
