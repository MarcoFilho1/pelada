import Link from 'next/link';
import type { ReactNode } from 'react';

/** Barra do topo: marca à esquerda, no máximo uma ação de texto à direita. */
export function Topo({ direita, inicio = '/' }: { direita?: ReactNode; inicio?: string }) {
  return (
    <header className="flex h-14 items-center justify-between">
      <Link href={inicio} className="-mx-2 flex h-12 items-center px-2 font-placa text-2xl font-semibold text-tinta">
        Pelada
      </Link>
      {direita}
    </header>
  );
}

/** Link de texto do topo, com alvo de toque de 48px. */
export function LinkTopo({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-mx-3 flex h-12 items-center px-3 text-base font-medium text-apagado transition-colors hover:text-tinta"
    >
      {children}
    </Link>
  );
}

/** Coluna única das telas de celular: margens de 20px, largura de leitura no desktop. */
export function Tela({ children }: { children: ReactNode }) {
  // No celular o conteúdo fica no topo (o teclado ocupa a metade de baixo);
  // em telas grandes, sem teclado, a coluna centraliza na altura.
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 md:pb-24 md:[&>main]:my-auto md:[&>main]:flex-none">
      {children}
    </div>
  );
}
