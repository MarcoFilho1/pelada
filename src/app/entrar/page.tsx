import type { Metadata } from 'next';
import { LinkTopo, Tela, Topo } from '@/components/topo';
import { EntrarJogador } from './entrar-jogador';

export const metadata: Metadata = { title: 'Entrar · Pelada' };

export default function EntrarPage() {
  return (
    <Tela>
      <Topo direita={<LinkTopo href="/admin/entrar">Admin</LinkTopo>} />
      <EntrarJogador />
    </Tela>
  );
}
