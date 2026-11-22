import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { avisoDeEntrada } from '@/domain/mensagens';
import { getDb } from '@/db/client';
import { lerSessaoJogador } from '@/server/sessao';
import { LinkTopo, Tela, Topo } from '@/components/topo';
import { EntrarJogador } from './entrar-jogador';

export const metadata: Metadata = { title: 'Entrar · Pelada' };

// Quem já entrou não precisa escolher o nome de novo.
export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  if (await lerSessaoJogador(getDb())) redirect('/lista');
  return (
    <Tela>
      <Topo direita={<LinkTopo href="/admin/entrar">Admin</LinkTopo>} />
      <EntrarJogador aviso={avisoDeEntrada((await searchParams).aviso)} />
    </Tela>
  );
}
