'use client';

// O desempate na tela da próxima partida: depois de um empate, cara (time A) ou coroa (time B)
// decide quem volta primeiro para a fila. O peso para quem jogou menos fica no servidor.
//
// A moeda é 3D de verdade: duas faces e uma borda feita de discos empilhados. Ao jogar, ela sobe
// girando no eixo de cima para baixo, cai, quica e para na face sorteada; a sombra no chão encolhe
// enquanto ela está no alto. Parada, ela inclina com o celular (giroscópio) ou com o mouse no PC.

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { NOME_DA_COR } from '@/components/colete';
import { MSG_ALGO_DEU_ERRADO } from '@/domain/mensagens';
import type { Cor } from '@/domain/sorteio';
import { vibrar } from '@/lib/vibrar';
import { moeda } from './acoes';

const VOO_MS = 2200;
const ALTURA_PX = 190;
/** Voltas completas no ar (mais meia, se cair coroa). */
const VOLTAS = 7;
const INCLINACAO_MAX = 28;
/** Discos da borda e a espessura da moeda. */
const CAMADAS = 12;
const ESPESSURA_PX = 10;

const FACE: Record<Cor, string> = {
  azul: 'bg-colete-azul text-chao',
  laranja: 'bg-colete-laranja text-chao',
  verde: 'bg-colete-verde text-chao',
  preto: 'bg-placa-alta text-tinta',
};
const BORDA: Record<Cor, string> = {
  azul: '#2f62bd',
  laranja: '#c06a1c',
  verde: '#1d8549',
  preto: '#3d3d3d',
};

type Lado = 'A' | 'B';
type PedidoDeOrientacao = { requestPermission?: () => Promise<'granted' | 'denied'> };

const giroDaFace = (lado: Lado | null) => (lado === 'B' ? 180 : 0);
const reduzido = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const limitar = (v: number) => Math.max(-INCLINACAO_MAX, Math.min(INCLINACAO_MAX, v));

export function Desempate({
  partidaId,
  corA,
  corB,
  resultado,
}: {
  partidaId: number;
  corA: Cor;
  corB: Cor;
  /** Já jogada (o lado que ganhou) ou null. */
  resultado: Lado | null;
}) {
  const router = useRouter();
  const [girando, setGirando] = useState(false);
  const [mostrado, setMostrado] = useState<Lado | null>(resultado);
  const [erro, setErro] = useState<string | null>(null);
  const voo = useRef<HTMLDivElement>(null);
  const giro = useRef<HTMLDivElement>(null);
  const sombra = useRef<HTMLDivElement>(null);
  const inclinacao = useInclinacao();
  const deu = mostrado ?? (girando ? null : resultado);

  async function jogar() {
    setErro(null);
    setGirando(true);
    // iPhone: o giroscópio só liga com permissão pedida num toque (depois, a moeda inclina com o celular).
    void inclinacao.pedirPermissao();
    vibrar('assistencia');
    const r = await moeda(partidaId).catch(() => ({ ok: false as const, erro: MSG_ALGO_DEU_ERRADO }));
    if (!r.ok) {
      setGirando(false);
      setErro(r.erro);
      return;
    }
    await animarJogada(r.lado);
    setMostrado(r.lado);
    setGirando(false);
    vibrar('gol');
    router.refresh();
  }

  async function animarJogada(lado: Lado) {
    const [v, g, s] = [voo.current, giro.current, sombra.current];
    if (!v || !g || !s || reduzido()) {
      if (g) g.style.transform = `rotateX(${giroDaFace(lado)}deg)`;
      return;
    }
    const fim = VOLTAS * 360 + giroDaFace(lado);
    const subida = 'cubic-bezier(.2,.7,.35,1)';
    const queda = 'cubic-bezier(.6,0,.85,.4)';
    const animacoes = [
      v.animate(
        [
          { transform: 'translateY(0) scale(1)', easing: subida },
          { transform: `translateY(-${ALTURA_PX}px) scale(1.12)`, offset: 0.42, easing: queda },
          { transform: 'translateY(0) scale(1)', offset: 0.82, easing: 'ease-out' },
          { transform: 'translateY(-22px) scale(1.02)', offset: 0.9, easing: 'ease-in' },
          { transform: 'translateY(0) scale(1)', offset: 0.96, easing: 'ease-out' },
          { transform: 'translateY(-4px) scale(1)', offset: 0.98 },
          { transform: 'translateY(0) scale(1)' },
        ],
        { duration: VOO_MS, fill: 'forwards' },
      ),
      // Gira rápido na subida e vai freando até assentar na face, com um balanço no quique.
      g.animate(
        [
          { transform: 'rotateX(0deg)', easing: 'linear' },
          { transform: `rotateX(${fim * 0.55}deg)`, offset: 0.42, easing: 'linear' },
          { transform: `rotateX(${fim - 20}deg)`, offset: 0.82, easing: 'ease-out' },
          { transform: `rotateX(${fim + 14}deg)`, offset: 0.9, easing: 'ease-in-out' },
          { transform: `rotateX(${fim - 5}deg)`, offset: 0.96, easing: 'ease-in-out' },
          { transform: `rotateX(${fim}deg)` },
        ],
        { duration: VOO_MS, fill: 'forwards' },
      ),
      s.animate(
        [
          { transform: 'scale(1)', opacity: 0.55, easing: subida },
          { transform: 'scale(0.35)', opacity: 0.15, offset: 0.42, easing: queda },
          { transform: 'scale(1)', opacity: 0.55, offset: 0.82 },
          { transform: 'scale(0.85)', opacity: 0.45, offset: 0.9 },
          { transform: 'scale(1)', opacity: 0.55 },
        ],
        { duration: VOO_MS, fill: 'forwards' },
      ),
    ];
    // Toque tátil quando bate no chão (no Android; no iPhone, fora de um toque, fica sem).
    setTimeout(() => vibrar('gol'), VOO_MS * 0.82);
    await Promise.all(animacoes.map((a) => a.finished.catch(() => {})));
  }

  const vencedor = deu === null ? null : NOME_DA_COR[deu === 'A' ? corA : corB];
  const face = 'absolute inset-0 flex items-center justify-center rounded-full font-placa text-2xl font-bold tracking-wide uppercase [backface-visibility:hidden]';
  // Brilho que corre pela face conforme a inclinação, para parecer metal.
  const brilho: CSSProperties = {
    background: `radial-gradient(circle at ${50 + inclinacao.y * 1.4}% ${50 - inclinacao.x * 1.4}%, rgba(255,255,255,.45), rgba(255,255,255,0) 55%)`,
  };

  return (
    <section
      aria-labelledby="desempate"
      className="mt-3 rounded-placa bg-placa px-4 pt-5 pb-4"
      onPointerMove={inclinacao.peloPonteiro}
      onPointerLeave={inclinacao.soltarPonteiro}
    >
      <div className="relative flex h-36 items-end justify-center [perspective:700px]" aria-hidden="true">
        <div
          ref={sombra}
          className="absolute bottom-0 h-3 w-24 rounded-[50%] bg-black opacity-55 blur-[3px]"
          style={{ transform: 'scale(1)' }}
        />
        <div
          className="relative mb-2 [transform-style:preserve-3d] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
          style={{ transform: `rotateX(${inclinacao.x}deg) rotateY(${inclinacao.y}deg)` }}
        >
          <div ref={voo} className="[transform-style:preserve-3d]">
            <div ref={giro} className="relative size-28 [transform-style:preserve-3d]" style={{ transform: `rotateX(${giroDaFace(deu)}deg)` }}>
              {Array.from({ length: CAMADAS }, (_, i) => (
                <span
                  key={i}
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: i < CAMADAS / 2 ? BORDA[corB] : BORDA[corA],
                    transform: `translateZ(${-ESPESSURA_PX / 2 + (i * ESPESSURA_PX) / (CAMADAS - 1)}px)`,
                  }}
                />
              ))}
              <span className={`${face} ${FACE[corA]} ring-4 ring-black/15 ring-inset`} style={{ transform: `translateZ(${ESPESSURA_PX / 2 + 0.5}px)` }}>
                <span className="absolute inset-0 rounded-full" style={brilho} />
                <span className="relative">Cara</span>
              </span>
              <span
                className={`${face} ${FACE[corB]} ring-4 ring-black/15 ring-inset`}
                style={{ transform: `rotateX(180deg) translateZ(${ESPESSURA_PX / 2 + 0.5}px)` }}
              >
                <span className="absolute inset-0 rounded-full" style={brilho} />
                <span className="relative">Coroa</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 text-center">
        <h3 id="desempate" className="font-placa text-2xl font-semibold text-tinta">
          {vencedor ? `Deu ${deu === 'A' ? 'cara' : 'coroa'}: ${vencedor}` : girando ? 'No ar…' : 'Desempate'}
        </h3>
        <p className="mt-1 text-base text-apagado" aria-live="polite">
          {vencedor ? `${vencedor} volta primeiro para a fila.` : `${NOME_DA_COR[corA]} é cara, ${NOME_DA_COR[corB]} é coroa.`}
        </p>
      </div>
      {deu === null && (
        <button
          type="button"
          onClick={jogar}
          disabled={girando}
          className="mt-4 flex h-toque w-full items-center justify-center rounded-full bg-lima text-base font-semibold text-chao transition-opacity disabled:opacity-60"
        >
          {girando ? 'Girando…' : 'Jogar a moeda'}
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

/**
 * Inclinação da moeda: pelo giroscópio do celular (frente/trás e lados) ou, no PC, pela posição do
 * mouse sobre o cartão. Sem suporte ou com movimento reduzido, fica reta.
 */
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
      setX(limitar(-(e.beta - base.current) * 0.8));
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
