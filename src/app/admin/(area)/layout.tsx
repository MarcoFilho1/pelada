import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { ForaDoAnotador } from '@/components/fora-do-anotador';
import { NavAdmin } from '@/components/nav-admin';
import { TelaAdmin, Topo } from '@/components/topo';
import { lerSessaoAdmin } from '@/server/sessao';
import { sairDoAdmin } from './actions';

const SAIR = 'flex h-12 items-center text-base font-medium text-apagado transition-colors hover:text-tinta';

// Guarda da área admin (tudo em /admin menos /admin/entrar), conferida no banco.
// Também desenha a navegação (menos no anotador, que ocupa a tela inteira): no celular, a barra do
// topo (marca, "Sair") e as abas das seções; a partir de 1024px, o menu lateral fixo com o "Sair" no pé.
export default async function AreaAdminLayout({ children }: LayoutProps<'/admin'>) {
  if (!(await lerSessaoAdmin(getDb()))) redirect('/admin/entrar');
  return (
    <TelaAdmin>
      <ForaDoAnotador>
        <div className="contents lg:hidden">
          <Topo
            inicio="/admin"
            direita={
              <form action={sairDoAdmin}>
                <button type="submit" className={`-mx-3 px-3 ${SAIR}`}>
                  Sair
                </button>
              </form>
            }
          />
          <NavAdmin />
        </div>
        <div data-menu-lateral className="hidden lg:sticky lg:top-0 lg:col-start-1 lg:flex lg:h-dvh lg:flex-col lg:px-5 lg:pb-4">
          <Topo inicio="/admin" />
          {/* Itens com 12px de folga: o texto alinha com a marca e a placa do atual sai um pouco para fora. */}
          <div className="-mx-3 mt-4 flex flex-1 flex-col justify-between">
            <NavAdmin lateral />
            <form action={sairDoAdmin}>
              <button type="submit" className={`w-full rounded-placa px-3 ${SAIR}`}>
                Sair
              </button>
            </form>
          </div>
        </div>
      </ForaDoAnotador>
      {children}
    </TelaAdmin>
  );
}
