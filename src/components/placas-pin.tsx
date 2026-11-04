'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';

export type EstadoPlacas = 'normal' | 'erro' | 'ok';

type Props = {
  id: string;
  valor: string;
  onChange: (valor: string) => void;
  estado?: EstadoPlacas;
  desabilitado?: boolean;
  /** Ignora digitação sem tirar o foco: o teclado do celular continua aberto. */
  travado?: boolean;
  autoFocus?: boolean;
  /** id do texto que explica o campo (dica ou erro), ligado por aria-describedby. */
  descricaoId?: string;
  rotulo: string;
};

const TAMANHO = 4;
/** Quanto tempo o número recém-digitado fica pintado na placa antes de virar um ponto. */
const REVELAR_MS = 700;

/**
 * PIN como quatro placas de placar. Um único <input> numérico, transparente, fica
 * por cima das placas: o toque em qualquer placa abre o teclado numérico do celular,
 * e leitores de tela veem um campo comum.
 */
export const PlacasPin = forwardRef<HTMLInputElement, Props>(function PlacasPin(
  { id, valor, onChange, estado = 'normal', desabilitado = false, travado = false, autoFocus, descricaoId, rotulo },
  ref,
) {
  const [focado, setFocado] = useState(false);
  const [revelada, setRevelada] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function mudar(bruto: string) {
    const novo = bruto.replace(/\D/g, '').slice(0, TAMANHO);
    clearTimeout(timer.current);
    if (novo.length > valor.length) {
      setRevelada(novo.length - 1);
      timer.current = setTimeout(() => setRevelada(null), REVELAR_MS);
    } else {
      setRevelada(null);
    }
    onChange(novo);
  }

  return (
    <div className="relative mx-auto w-fit">
      <div className="flex gap-3" aria-hidden="true">
        {Array.from({ length: TAMANHO }, (_, i) => {
          const cheia = i < valor.length;
          const atual = focado && !desabilitado && i === Math.min(valor.length, TAMANHO - 1) && valor.length < TAMANHO;
          return (
            <div
              key={i}
              className={[
                'flex h-[76px] w-16 items-center justify-center rounded-placa transition-colors duration-150',
                estado === 'erro' ? 'bg-erro-fundo' : cheia ? 'bg-placa-alta' : 'bg-placa',
                atual ? 'ring-2 ring-tinta ring-inset' : '',
                desabilitado ? 'opacity-60' : '',
              ].join(' ')}
            >
              {cheia && revelada === i && estado === 'normal' ? (
                // monta quando a placa é pendurada: a animação roda uma vez por dígito
                <span className="font-placa text-numero font-semibold text-tinta motion-safe:animate-pendurar">{valor[i]}</span>
              ) : cheia ? (
                <span
                  className={[
                    'block size-4 rounded-full',
                    estado === 'erro' ? 'bg-erro' : estado === 'ok' ? 'bg-lima' : 'bg-tinta',
                  ].join(' ')}
                />
              ) : (
                <span className={['block h-1 w-6 rounded-full', estado === 'erro' ? 'bg-erro' : 'bg-placa-alta'].join(' ')} />
              )}
            </div>
          );
        })}
      </div>
      <input
        ref={ref}
        id={id}
        aria-label={rotulo}
        aria-describedby={descricaoId}
        aria-invalid={estado === 'erro' || undefined}
        value={valor}
        onChange={(e) => mudar(e.target.value)}
        onFocus={() => setFocado(true)}
        onBlur={() => setFocado(false)}
        disabled={desabilitado}
        readOnly={travado}
        autoFocus={autoFocus}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={TAMANHO}
        autoComplete="off"
        enterKeyHint="go"
        className="absolute inset-0 h-full w-full cursor-pointer text-base opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  );
});
