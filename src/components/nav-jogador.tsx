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

/**
 * Barra de baixo do jogador: Lista · Ranking · Perfil, fixa no rodapé, fundo #000.
 * Também reserva o espaço dela no fim da página, para nada ficar escondido atrás.
 */
export function NavJogador() {
  const caminho = usePathname();
  if (SEM_BARRA.some((c) => caminho === c || caminho.startsWith(`${c}/`))) return null;
  return (
    <>
      <div aria-hidden="true" className="h-[calc(4rem+env(safe-area-inset-bottom))] shrink-0" />
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-10 bg-chao pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid h-16 max-w-md grid-cols-3 gap-1 px-3 py-1">
          {ITENS.map(({ href, rotulo }) => {
            const atual = caminho === href || caminho.startsWith(`${href}/`);
            return (
              <li key={href} className="flex">
                <Link
                  href={href}
                  aria-current={atual ? 'page' : undefined}
                  className={`flex flex-1 items-center justify-center rounded-placa text-base font-medium transition-colors ${
                    atual ? 'bg-placa text-tinta' : 'text-apagado hover:text-tinta'
                  }`}
                >
                  {rotulo}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
