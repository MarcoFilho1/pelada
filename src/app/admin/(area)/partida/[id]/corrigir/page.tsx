import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { idValido } from '@/server/erros';
import { lerSessaoAdmin } from '@/server/sessao';
import { lerEstado } from '../estado';
import { Correcao } from './Correcao';

export const metadata: Metadata = { title: 'Corrigir partida · Pelada' };

export default async function CorrigirPage({ params }: PageProps<'/admin/partida/[id]/corrigir'>) {
  const db = getDb();
  if (!(await lerSessaoAdmin(db))) redirect('/admin/entrar');
  const id = Number((await params).id);
  const estado = idValido(id) ? await lerEstado(db, id) : null;
  // Inexistente ou ainda rolando: o anotador explica (e é lá que se mexe numa partida em andamento).
  if (!estado || !estado.encerrada) redirect(`/admin/partida/${(await params).id}`);
  return <Correcao estado={estado} />;
}
