'use client';

// O desempate na tela da próxima partida: depois de um empate, cara (time A) ou coroa (time B)
// decide quem volta primeiro para a fila. O peso para quem jogou menos fica no servidor.

import { useRouter } from 'next/navigation';
import { useState, type CSSProperties } from 'react';
import { NOME_DA_COR } from '@/components/colete';
import { MSG_ALGO_DEU_ERRADO } from '@/domain/mensagens';
import type { Cor } from '@/domain/sorteio';
import { vibrar } from '@/lib/vibrar';
import { moeda } from './acoes';

const GIRO_MS = 1600;

const FUNDO: Record<Cor, string> = {
  azul: 'bg-colete-azul text-chao',
  laranja: 'bg-colete-laranja text-chao',
  verde: 'bg-colete-verde text-chao',
  preto: 'bg-placa-alta text-tinta ring-4 ring-inset ring-apagado',
};

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
  resultado: 'A' | 'B' | null;
}) {
  const router = useRouter();
  const [girando, setGirando] = useState(false);
  const [giro, setGiro] = useState(resultado === 'B' ? 180 : 0);
  const [mostrado, setMostrado] = useState<'A' | 'B' | null>(resultado);
  const [erro, setErro] = useState<string | null>(null);
  const deu = mostrado ?? (girando ? null : resultado);

  async function jogar() {
    setErro(null);
    setGirando(true);
    vibrar('gol');
    const r = await moeda(partidaId).catch(() => ({ ok: false as const, erro: MSG_ALGO_DEU_ERRADO }));
    if (!r.ok) {
      setGirando(false);
      setErro(r.erro);
      return;
    }
    setGiro((g) => Math.ceil(g / 360) * 360 + 1800 + (r.lado === 'B' ? 180 : 0));
    setTimeout(() => {
      setMostrado(r.lado);
      setGirando(false);
      vibrar('assistencia');
      router.refresh();
    }, GIRO_MS);
  }

  const face = 'absolute inset-0 flex items-center justify-center rounded-full font-placa text-xl font-bold uppercase [backface-visibility:hidden]';
  const vencedor = deu === null ? null : NOME_DA_COR[deu === 'A' ? corA : corB];

  return (
    <section aria-labelledby="desempate" className="mt-3 rounded-placa bg-placa p-4">
      <div className="flex items-center gap-4">
        <div className="[perspective:600px]">
          <div
            className="relative size-20 [transform-style:preserve-3d] motion-safe:transition-transform motion-safe:duration-[1600ms] motion-safe:ease-[cubic-bezier(.2,.7,.2,1)]"
            style={{ transform: `rotateY(${giro}deg)` } as CSSProperties}
            aria-hidden="true"
          >
            <span className={`${face} ${FUNDO[corA]}`}>Cara</span>
            <span className={`${face} ${FUNDO[corB]} [transform:rotateY(180deg)]`}>Coroa</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="desempate" className="text-base font-semibold text-tinta">
            {vencedor ? `Deu ${deu === 'A' ? 'cara' : 'coroa'}: ${vencedor}` : 'Desempate'}
          </h3>
          <p className="text-base text-apagado" aria-live="polite">
            {vencedor
              ? `${vencedor} volta primeiro para a fila.`
              : girando
                ? 'Girando…'
                : `${NOME_DA_COR[corA]} é cara, ${NOME_DA_COR[corB]} é coroa.`}
          </p>
        </div>
      </div>
      {deu === null && (
        <button
          type="button"
          onClick={jogar}
          disabled={girando}
          className="mt-3 flex h-toque w-full items-center justify-center rounded-full bg-lima text-base font-semibold text-chao transition-opacity disabled:opacity-60"
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
