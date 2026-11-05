import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { listarAdmins } from '@/server/admins';
import { lerSessaoAdmin } from '@/server/sessao';
import { FormsAdmins } from './forms-admins';

export const metadata: Metadata = { title: 'Admins · Pelada' };

export default async function AdminsPage() {
  const db = getDb();
  const sessao = await lerSessaoAdmin(db);
  if (!sessao) redirect('/admin/entrar');
  const admins = await listarAdmins(db);
  return (
    <main className="flex flex-1 flex-col pb-10">
      <h1 className="mt-6 font-placa text-titulo font-semibold">Admins</h1>
      <ul className="mt-4 flex flex-col gap-2">
        {admins.map((a) => (
          <li key={a.id} className="flex h-toque items-center justify-between gap-3 rounded-placa bg-placa px-4">
            <span className="min-w-0 truncate text-linha font-medium">{a.usuario}</span>
            {a.id === sessao.adminId && <span className="shrink-0 text-base text-meta">você</span>}
          </li>
        ))}
      </ul>
      <FormsAdmins />
    </main>
  );
}
