'use client';

// Um pedaço de tela que mora num lugar no celular e noutro no PC (DESIGN.md › No PC, "Duas larguras, um
// estado"). Usado no sorteio do admin e na lista do jogador.

import { useSyncExternalStore, type ReactNode } from 'react';

const PC = '(min-width: 64rem)'; // o `lg` do Tailwind

function assinar(aviso: () => void) {
  const m = window.matchMedia(PC);
  m.addEventListener('change', aviso);
  return () => m.removeEventListener('change', aviso);
}

/** true no PC (≥1024px), false no celular, null antes de hidratar (o servidor não sabe a largura). */
export function useNoPc() {
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(PC).matches,
    () => null,
  );
}

/**
 * Um pedaço que tem um lugar no celular e outro no PC, com o mesmo estado de quem chama. Antes de hidratar
 * as duas cópias vão no HTML e o CSS de quem chama esconde a da outra largura; depois só fica a da largura
 * atual: nada de texto, id ou leitor de tela em dobro. Girar o tablet troca a cópia sem perder nada, porque
 * o estado mora em quem chama.
 */
export function SoNo({ pc, children }: { pc: boolean; children: ReactNode }) {
  const noPc = useNoPc();
  return noPc === null || noPc === pc ? children : null;
}
