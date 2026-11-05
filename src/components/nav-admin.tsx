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

/** Navegação da área admin: texto, a seção atual em branco sobre uma placa. Rola de lado se não couber. */
export function NavAdmin() {
  const caminho = usePathname();
  return (
    <nav aria-label="Admin" className="-mx-5 mb-1 overflow-x-auto px-5 [scrollbar-width:none]">
      <ul className="flex w-max">
        {ITENS.map(({ href, rotulo }) => {
          const atual = href === '/admin' ? caminho === '/admin' : caminho === href || caminho.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={atual ? 'page' : undefined}
                className={`flex h-12 items-center rounded-placa px-2.5 text-base font-medium transition-colors ${
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
