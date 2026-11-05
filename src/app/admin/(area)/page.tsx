import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SetaDireita } from '@/components/icones';
import { getDb } from '@/db/client';
import { lerSessaoAdmin } from '@/server/sessao';

export const metadata: Metadata = { title: 'Painel · Pelada' };

const SECOES = [
  { href: '/admin/jogadores', titulo: 'Jogadores', texto: 'Cadastro, nota e PIN' },
  { href: '/admin/mensalistas', titulo: 'Mensalistas', texto: 'Quem tem vaga fixa no mês' },
  { href: '/admin/admins', titulo: 'Admins', texto: 'Quem pode mexer no painel' },
];

export default async function AdminPage() {
  if (!(await lerSessaoAdmin(getDb()))) redirect('/admin/entrar');
  return (
    <main className="flex flex-1 flex-col">
      <h1 className="mt-6 font-placa text-titulo font-semibold">Painel</h1>
      <p className="mt-2 text-base text-apagado">O que você quer mexer?</p>
      <ul className="mt-6 flex flex-col">
        {SECOES.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="-mx-4 flex min-h-toque w-[calc(100%+2rem)] items-center justify-between gap-3 rounded-placa px-4 py-2 transition-colors hover:bg-placa active:bg-placa-alta"
            >
              <span>
                <span className="block text-linha font-medium text-tinta">{s.titulo}</span>
                <span className="block text-base text-meta">{s.texto}</span>
              </span>
              <SetaDireita className="size-5 shrink-0 text-meta" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
