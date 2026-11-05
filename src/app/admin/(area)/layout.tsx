import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { lerSessaoAdmin } from '@/server/sessao';

// Guarda da área admin (tudo em /admin menos /admin/entrar), conferida no banco.
export default async function AreaAdminLayout({ children }: LayoutProps<'/admin'>) {
  if (!(await lerSessaoAdmin(getDb()))) redirect('/admin/entrar');
  return children;
}
