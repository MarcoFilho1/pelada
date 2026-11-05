import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { aberturaLista } from '@/domain/tempo';
import { estadoDaSemana } from '@/server/presencas';
import { lerSessaoAdmin } from '@/server/sessao';
import { PeladaAdmin } from './pelada-admin';

export const metadata: Metadata = { title: 'Pelada · Pelada' };

function diaMes(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

export default async function PeladaPage() {
  const db = getDb();
  if (!(await lerSessaoAdmin(db))) redirect('/admin/entrar');
  const now = new Date();
  const estado = await estadoDaSemana(db, now);
  return (
    <PeladaAdmin
      peladaId={estado.peladaId}
      dataQuarta={diaMes(estado.data)}
      abertura={diaMes(new Date(aberturaLista(estado.data).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10))}
      estadoManual={estado.estadoManual}
      aberta={estado.aberta}
      principal={estado.principal}
      fila={estado.fila}
      foraDoPrazo={estado.foraDoPrazo}
      vagas={estado.vagas}
    />
  );
}
