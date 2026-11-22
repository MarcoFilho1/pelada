'use client';

import { useActionState, useEffect, useRef } from 'react';
import { separar, type EstadoDupla } from './acoes';

const INICIAL: EstadoDupla = { ok: false, mensagem: null };
const CAMPO = 'mt-2 h-toque w-full rounded-placa bg-placa px-4 text-linha text-tinta outline-none focus:ring-2 focus:ring-tinta';
const ROTULO = 'text-base font-medium text-apagado';
const PILULA =
  'mt-5 h-toque w-full rounded-full bg-tinta text-linha font-semibold text-chao transition-colors hover:bg-apagado active:bg-meta disabled:bg-placa-alta disabled:text-apagado';

export function NovaDupla({ jogadores }: { jogadores: { id: number; nome: string }[] }) {
  const [estado, enviar, enviando] = useActionState(separar, INICIAL);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);

  const opcoes = (
    <>
      <option value="">Escolha</option>
      {jogadores.map((j) => (
        <option key={j.id} value={j.id}>
          {j.nome}
        </option>
      ))}
    </>
  );
  return (
    <section className="mt-10" aria-labelledby="h-nova-dupla">
      <h2 id="h-nova-dupla" className="font-placa text-2xl font-semibold">
        Separar mais uma dupla
      </h2>
      <form ref={form} action={enviar} className="mt-2 flex flex-col sm:grid sm:grid-cols-2 sm:gap-x-4">
        <label className={`mt-3 ${ROTULO}`}>
          Uma pessoa
          <select name="a" required className={CAMPO} defaultValue="">
            {opcoes}
          </select>
        </label>
        <label className={`mt-3 ${ROTULO}`}>
          E a outra
          <select name="b" required className={CAMPO} defaultValue="">
            {opcoes}
          </select>
        </label>
        <p role={estado.ok ? 'status' : 'alert'} className={`mt-4 min-h-6 text-base font-medium sm:col-span-2 ${estado.ok ? 'text-lima' : 'text-erro'}`}>
          {estado.mensagem}
        </p>
        <button type="submit" disabled={enviando} className={`${PILULA} sm:col-span-2`}>
          Separar
        </button>
      </form>
    </section>
  );
}
