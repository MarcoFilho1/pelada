import type { Metadata } from 'next';
import { LinkTopo, Tela, Topo } from '@/components/topo';
import { EntrarAdmin } from './entrar-admin';

export const metadata: Metadata = { title: 'Admin · Pelada' };

export default function EntrarAdminPage() {
  return (
    <Tela>
      <Topo inicio="/admin" direita={<LinkTopo href="/entrar">Sou jogador</LinkTopo>} />
      <EntrarAdmin />
    </Tela>
  );
}
