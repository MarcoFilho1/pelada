'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITENS = [
  { href: '/admin', rotulo: 'Painel' },
  { href: '/admin/pelada', rotulo: 'Pelada' },
  { href: '/admin/sorteio', rotulo: 'Sorteio' },
  { href: '/admin/partidas', rotulo: 'Partidas' },
  { href: '/admin/jogadores', rotulo: 'Jogadores' },
  { href: '/admin/mensalistas', rotulo: 'Mensalistas' },
  { href: '/admin/admins', rotulo: 'Admins' },
];

/**
 * Navegação da área admin: texto, a seção atual em branco sobre uma placa. No celular é uma linha
 * que rola de lado se não couber; no menu lateral do PC (`lateral`), uma lista vertical.
 */
export function NavAdmin({ lateral = false }: { lateral?: boolean }) {
  const caminho = usePathname();
  return (
    <nav aria-label="Admin" className={lateral ? '' : '-mx-5 mb-1 overflow-x-auto px-5 [scrollbar-width:none]'}>
      <ul className={lateral ? 'flex flex-col gap-1' : 'flex w-max'}>
        {ITENS.map(({ href, rotulo }) => {
          const atual = href === '/admin' ? caminho === '/admin' : caminho === href || caminho.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={atual ? 'page' : undefined}
                className={`flex h-12 items-center rounded-placa text-base font-medium transition-colors ${lateral ? 'px-3' : 'px-2.5'} ${
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
  );
}
