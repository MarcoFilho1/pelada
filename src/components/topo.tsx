import Link from 'next/link';
import type { ReactNode } from 'react';
import { MenuTopoJogador } from './nav-jogador';

/** Barra do topo: marca à esquerda, no máximo uma ação de texto à direita. */
export function Topo({ direita, inicio = '/', rotulo }: { direita?: ReactNode; inicio?: string; rotulo?: string }) {
  return (
    <header className="flex h-14 items-center justify-between">
      <Link href={inicio} aria-label={rotulo} className="-mx-2 flex h-12 items-center px-2 font-placa text-2xl font-semibold text-tinta">
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

const COLUNA = 'mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8 md:pb-24 md:[&>main]:my-auto md:[&>main]:flex-none';

/** Coluna única das telas de celular: margens de 20px, largura de leitura no desktop. */
export function Tela({ children }: { children: ReactNode }) {
  // No celular o conteúdo fica no topo (o teclado ocupa a metade de baixo);
  // em telas grandes, sem teclado, a coluna centraliza na altura.
  return (
    <div className={COLUNA}>
      {children}
    </div>
  );
}

/**
 * Moldura da área admin. Abaixo de 1024px é a mesma coluna da `Tela`. A partir de 1024px, com o menu
 * lateral (`data-menu-lateral`; variante `admin-pc` no globals.css), vira duas colunas: o menu fixo e o
 * conteúdo (`main`), alinhado no alto, com até 1152px no espaço ao lado do menu. Cada página decide as
 * próprias colunas. Sem o menu (anotador), continua a coluna centrada da `Tela`.
 */
export function TelaAdmin({ children }: { children: ReactNode }) {
  return (
    <div className={`${COLUNA} admin-pc:grid admin-pc:max-w-none admin-pc:grid-cols-[15rem_minmax(0,1fr)] admin-pc:px-0 admin-pc:pb-0 admin-pc:[&>main]:col-start-2 admin-pc:[&>main]:my-0 admin-pc:[&>main]:w-full admin-pc:[&>main]:max-w-6xl admin-pc:[&>main]:justify-self-center admin-pc:[&>main]:px-10 admin-pc:[&>main]:pt-4 admin-pc:[&>main]:pb-16`}>
      {children}
    </div>
  );
}

/**
 * Moldura das telas do jogador com menu (Lista, Ranking, Perfil). Abaixo de 1024px é a `Tela` com a barra
 * do topo de sempre (o menu fica na barra de baixo). A partir de 1024px a barra do topo ganha o menu à
 * direita da marca e a moldura se abre até 1152px com 40px de margem. `pc`: a tela já tem colunas próprias
 * (o `main` usa a largura, alinhado no alto); sem ele, o conteúdo continua a coluna de 448px centrada.
 */
export function TelaJogador({ children, pc = false }: { children: ReactNode; pc?: boolean }) {
  return (
    <div
      className={`${COLUNA} lg:max-w-6xl lg:px-10 ${
        pc ? 'lg:pb-16 lg:[&>main]:my-0' : 'lg:[&>main]:mx-auto lg:[&>main]:w-full lg:[&>main]:max-w-md'
      }`}
    >
      <Topo inicio="/lista" direita={<MenuTopoJogador />} />
      {children}
    </div>
  );
}
