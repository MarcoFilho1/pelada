import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { ForaDoAnotador } from '@/components/fora-do-anotador';
import { NavAdmin } from '@/components/nav-admin';
import { Tela, Topo } from '@/components/topo';
import { lerSessaoAdmin } from '@/server/sessao';
import { sairDoAdmin } from './actions';

// Guarda da área admin (tudo em /admin menos /admin/entrar), conferida no banco.
// Também desenha a barra do topo (marca, "Sair") e a navegação das seções (menos no anotador,
// que ocupa a tela inteira).
export default async function AreaAdminLayout({ children }: LayoutProps<'/admin'>) {
  if (!(await lerSessaoAdmin(getDb()))) redirect('/admin/entrar');
  return (
    <Tela>
      <ForaDoAnotador>
        <Topo
          inicio="/admin"
          direita={
            <form action={sairDoAdmin}>
              <button
                type="submit"
                className="-mx-3 flex h-12 items-center px-3 text-base font-medium text-apagado transition-colors hover:text-tinta"
              >
                Sair
              </button>
            </form>
          }
        />
        <NavAdmin />
      </ForaDoAnotador>
      {children}
    </Tela>
  );
}
