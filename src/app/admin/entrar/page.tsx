import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { lerSessaoAdmin } from '@/server/sessao';
import { LinkTopo, Tela, Topo } from '@/components/topo';
import { EntrarAdmin } from './entrar-admin';

export const metadata: Metadata = { title: 'Admin · Pelada' };

export default async function EntrarAdminPage() {
  if (await lerSessaoAdmin(getDb())) redirect('/admin');
  return (
    <Tela>
      <Topo inicio="/admin" direita={<LinkTopo href="/entrar">Sou jogador</LinkTopo>} />
      <EntrarAdmin />
    </Tela>
  );
}
