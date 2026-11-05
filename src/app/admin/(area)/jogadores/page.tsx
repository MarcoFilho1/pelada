import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { listarJogadores } from '@/server/jogadores';
import { lerSessaoAdmin } from '@/server/sessao';
import { JogadoresAdmin } from './jogadores-admin';

export const metadata: Metadata = { title: 'Jogadores · Pelada' };

export default async function JogadoresPage() {
  const db = getDb();
  if (!(await lerSessaoAdmin(db))) redirect('/admin/entrar');
  const jogadores = await listarJogadores(db, { incluirInativos: true });
  return <JogadoresAdmin jogadores={jogadores} />;
}
