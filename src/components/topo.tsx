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

/**
 * Moldura da área admin. Abaixo de 1024px é a mesma coluna da `Tela`. A partir de 1024px vira duas
 * colunas: o menu lateral fixo (o primeiro filho visível) e o conteúdo (`main`), alinhado no alto,
 * com largura de até 1152px no espaço ao lado do menu. Cada página decide as próprias colunas.
 */
export function TelaAdmin({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 md:pb-24 md:[&>main]:my-auto md:[&>main]:flex-none lg:grid lg:max-w-none lg:grid-cols-[15rem_minmax(0,1fr)] lg:px-0 lg:pb-0 lg:[&>main]:col-start-2 lg:[&>main]:my-0 lg:[&>main]:w-full lg:[&>main]:max-w-6xl lg:[&>main]:justify-self-center lg:[&>main]:px-10 lg:[&>main]:pt-4 lg:[&>main]:pb-16">
      {children}
    </div>
  );
}
