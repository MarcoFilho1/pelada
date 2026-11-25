'use client';

// A moeda da próxima partida. Depois de um empate, quando um dos dois times for entrar e o outro
// esperar, a tela mostra quem já está na partida e a outra vaga travada ("Verde ou Laranja?"); a
// moeda decide quem ocupa a vaga: cara é o time A do empate, coroa o B. O peso para quem jogou
// menos fica no servidor. A moeda é 3D (ver `moeda-3d.ts`, carregado só aqui).

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Colete, NOME_DA_COR } from '@/components/colete';
import { MSG_ALGO_DEU_ERRADO } from '@/domain/mensagens';
import type { Cor } from '@/domain/sorteio';
import { vibrar } from '@/lib/vibrar';
import type { MoedaDaNoite } from '@/server/partidas';
import { moeda } from './acoes';
import type { Moeda3D } from './moeda-3d';

type Lado = 'A' | 'B';
type PedidoDeOrientacao = { requestPermission?: () => Promise<'granted' | 'denied'> };

const COR_DA_FACE: Record<Cor, string> = { branco: '#f4f4f4', preto: '#1c1c1c', verde: '#2fbf6a', amarelo: '#ffc933', azul: '#4d8dff', laranja: '#ff9a3d' };
const INCLINACAO_MAX = 22;

const reduzido = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const limitar = (v: number) => Math.max(-INCLINACAO_MAX, Math.min(INCLINACAO_MAX, v));

export function Desempate({ moeda: m }: { moeda: MoedaDaNoite }) {
  const router = useRouter();
  const [girando, setGirando] = useState(false);
  const [mostrado, setMostrado] = useState<Lado | null>(m.resultado);
  const [erro, setErro] = useState<string | null>(null);
  const [sem3d, setSem3d] = useState(false);
  const tela = useRef<HTMLCanvasElement>(null);
  const cena = useRef<Moeda3D | null>(null);
  const inclinacao = useInclinacao();
  const deu = mostrado ?? (girando ? null : m.resultado);
  const nome = (l: Lado) => NOME_DA_COR[(l === 'A' ? m.timeA : m.timeB).cor];

  // Monta a moeda 3D uma vez (o resultado guardado já aparece virado para cima).
  const faceInicial = useRef(m.resultado);
  useEffect(() => {
    let vivo = true;
    import('./moeda-3d')
      .then(({ criarMoeda3D }) => {
        if (!vivo || !tela.current) return;
        const face = (cor: Cor, texto: string) => ({ cor: COR_DA_FACE[cor], texto, time: NOME_DA_COR[cor].toUpperCase(), escuro: cor === 'preto' });
        cena.current = criarMoeda3D(tela.current, { A: face(m.timeA.cor, 'CARA'), B: face(m.timeB.cor, 'COROA') }, { aoBater: () => vibrar('gol') });
        cena.current.mostrar(faceInicial.current);
      })
      .catch(() => vivo && setSem3d(true));
    return () => {
      vivo = false;
      cena.current?.destruir();
      cena.current = null;
    };
  }, [m.timeA.cor, m.timeB.cor]);

  useEffect(() => cena.current?.inclinar(inclinacao.x, inclinacao.y), [inclinacao.x, inclinacao.y]);

  async function jogar() {
    setErro(null);
    setMostrado(null);
    setGirando(true);
    // iPhone: o giroscópio só liga com permissão pedida num toque.
    void inclinacao.pedirPermissao();
    vibrar('assistencia');
    const r = await moeda(m.partidaId).catch(() => ({ ok: false as const, erro: MSG_ALGO_DEU_ERRADO }));
    if (!r.ok) {
      setGirando(false);
      setErro(r.erro);
      return;
    }
    if (cena.current && !reduzido()) await cena.current.jogar(r.lado);
    else cena.current?.mostrar(r.lado);
    setMostrado(r.lado);
    setGirando(false);
    vibrar('gol');
    router.refresh();
  }

  const vencedor = deu === null ? null : deu === 'A' ? m.timeA : m.timeB;

  return (
    <section aria-labelledby="desempate" className="mt-3 rounded-placa bg-placa px-4 pt-4 pb-4" onPointerMove={inclinacao.peloPonteiro} onPointerLeave={inclinacao.soltarPonteiro}>
      <h3 id="desempate" className="font-placa text-2xl font-semibold text-tinta">
        {vencedor ? `Deu ${deu === 'A' ? 'cara' : 'coroa'}: ${NOME_DA_COR[vencedor.cor]}` : `Quem enfrenta o ${NOME_DA_COR[m.fixo.cor]}?`}
      </h3>
      <p className="mt-1 text-base text-apagado">
        {vencedor
          ? `${NOME_DA_COR[vencedor.cor]} entra contra o ${NOME_DA_COR[m.fixo.cor]}.`
          : `${nome('A')} e ${nome('B')} empataram. A moeda decide quem entra.`}
      </p>

      {/* O confronto: o time certo e a vaga da moeda. */}
      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-h-14 items-center gap-2 rounded-placa bg-placa-alta px-3 ring-2 ring-lima ring-inset">
          <Colete cor={m.fixo.cor} />
          <span className="truncate text-base font-semibold">{NOME_DA_COR[m.fixo.cor]}</span>
        </div>
        <span aria-hidden="true" className="font-placa text-xl font-semibold text-meta">
          ×
        </span>
        {vencedor ? (
          <div className="flex min-h-14 items-center gap-2 rounded-placa bg-placa-alta px-3 ring-2 ring-lima ring-inset">
            <Colete cor={vencedor.cor} />
            <span className="truncate text-base font-semibold">{NOME_DA_COR[vencedor.cor]}</span>
          </div>
        ) : (
          <div className="flex min-h-14 flex-col justify-center rounded-placa px-3 ring-1 ring-meta ring-inset [border-style:dashed]">
            <span className="flex items-center gap-1.5 text-sm text-meta">
              <Cadeado /> na moeda
            </span>
            <span className="truncate text-base font-semibold text-apagado">
              {nome('A')} ou {nome('B')}
            </span>
          </div>
        )}
      </div>

      <div className="relative mt-2 h-60" aria-hidden="true">
        {sem3d ? (
          <div className="flex h-full items-center justify-center font-placa text-4xl font-bold text-apagado">{deu === null ? '?' : deu === 'A' ? 'CARA' : 'COROA'}</div>
        ) : (
          <canvas ref={tela} className="absolute inset-x-0 -top-16 h-[calc(100%+4rem)] w-full" />
        )}
      </div>
      <p className="text-center text-sm text-meta">
        {nome('A')} é cara · {nome('B')} é coroa
      </p>

      {deu === null && (
        <button
          type="button"
          onClick={jogar}
          disabled={girando}
          className="mt-3 flex h-toque w-full items-center justify-center rounded-full bg-lima text-base font-semibold text-chao transition-opacity disabled:opacity-60"
        >
          {girando ? 'No ar…' : 'Jogar a moeda'}
        </button>
      )}
      {erro && (
        <p role="alert" className="mt-3 text-base font-medium text-erro">
          {erro}
        </p>
      )}
    </section>
  );
}

function Cadeado() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 fill-current" aria-hidden="true">
      <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2h.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h.5Zm1.5 0h4V5a2 2 0 1 0-4 0v2Z" />
    </svg>
  );
}

function useInclinacao() {
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const base = useRef<number | null>(null);

  useEffect(() => {
    if (reduzido() || typeof window.DeviceOrientationEvent === 'undefined') return;
    const ao = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      // A posição em que a pessoa segura vira o "reto" (a primeira leitura).
      base.current ??= e.beta;
      setX(limitar(-(e.beta - base.current) * 0.7));
      setY(limitar(e.gamma * 0.8));
    };
    window.addEventListener('deviceorientation', ao);
    return () => window.removeEventListener('deviceorientation', ao);
  }, []);

  return {
    x,
    y,
    async pedirPermissao() {
      try {
        const pedir = (window.DeviceOrientationEvent as unknown as PedidoDeOrientacao | undefined)?.requestPermission;
        if (pedir) await pedir();
      } catch {
        // Recusou ou não existe: a moeda só não inclina.
      }
    },
    peloPonteiro(e: PointerEvent<HTMLElement>) {
      if (e.pointerType !== 'mouse' || reduzido()) return;
      const r = e.currentTarget.getBoundingClientRect();
      setY(limitar(((e.clientX - r.left) / r.width - 0.5) * 2 * INCLINACAO_MAX));
      setX(limitar(-((e.clientY - r.top) / r.height - 0.5) * 2 * INCLINACAO_MAX));
    },
    soltarPonteiro(e: PointerEvent<HTMLElement>) {
      if (e.pointerType !== 'mouse') return;
      setX(0);
      setY(0);
    },
  };
}
