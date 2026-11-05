'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** O anotador ocupa a tela inteira: a barra do topo e a navegação do admin saem enquanto ele está aberto. */
export function ForaDoAnotador({ children }: { children: ReactNode }) {
  return /^\/admin\/partida\/[^/]+$/.test(usePathname()) ? null : children;
}
