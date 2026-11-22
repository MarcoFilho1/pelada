'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITENS = [
  { href: '/lista', rotulo: 'Lista' },
  { href: '/ranking', rotulo: 'Ranking' },
  { href: '/perfil', rotulo: 'Perfil' },
];

/** Telas de uma tarefa só (com teclado aberto), sem a barra: elas têm o próprio "voltar". */
const SEM_BARRA = ['/perfil/pin'];

const dentro = (caminho: string, href: string) => caminho === href || caminho.startsWith(`${href}/`);

/** O item da seção atual: branco sobre placa #111 (o mesmo do menu do admin); os outros em #b4b4b4. */
const item = (atual: boolean) =>
  `flex items-center rounded-placa text-base font-medium transition-colors ${atual ? 'bg-placa text-tinta' : 'text-apagado hover:text-tinta'}`;

function Itens({ caminho, classe }: { caminho: string; classe: string }) {
  return ITENS.map(({ href, rotulo }) => {
    const atual = dentro(caminho, href);
    return (
      <li key={href} className="flex">
        <Link href={href} aria-current={atual ? 'page' : undefined} className={`${item(atual)} ${classe}`}>
          {rotulo}
        </Link>
      </li>
    );
  });
}

/**
 * Barra de baixo do jogador (celular): Lista · Ranking · Perfil, fixa no rodapé, fundo #000.
 * Também reserva o espaço dela no fim da página, para nada ficar escondido atrás. A partir de 1024px
 * some (barra e espaço): o menu vai para o topo (`MenuTopoJogador`).
 */
export function NavJogador() {
  const caminho = usePathname();
  if (SEM_BARRA.some((c) => dentro(caminho, c))) return null;
  return (
    <>
      <div aria-hidden="true" className="h-[calc(4rem+env(safe-area-inset-bottom))] shrink-0 lg:hidden" />
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-10 bg-chao pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto grid h-16 max-w-md grid-cols-3 gap-1 px-3 py-1">
          <Itens caminho={caminho} classe="flex-1 justify-center" />
        </ul>
      </nav>
    </>
  );
}

/**
 * O mesmo menu no PC (≥1024px): links de texto na barra do topo, à direita da marca. Só uma das duas cópias
 * aparece em cada largura (o mesmo nome "Principal"). Com 12px de folga, o texto do último alinha com a
 * margem da coluna e a placa do atual sai um pouco para fora, como no menu lateral do admin.
 */
export function MenuTopoJogador() {
  const caminho = usePathname();
  if (SEM_BARRA.some((c) => dentro(caminho, c))) return null;
  return (
    <nav aria-label="Principal" className="-mr-3 hidden lg:block">
      <ul className="flex gap-1">
        <Itens caminho={caminho} classe="h-12 px-3" />
      </ul>
    </nav>
  );
}
