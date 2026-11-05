import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Tela, Topo } from '@/components/topo';
import { getDb } from '@/db/client';
import { lerSessaoJogador } from '@/server/sessao';
import { TrocarPin } from './trocar-pin';

export const metadata: Metadata = { title: 'Crie seu PIN · Pelada' };

export default async function TrocarPinPage() {
  // Fora do grupo (jogador) de propósito: aqui entra quem ainda precisa trocar o PIN.
  const sessao = await lerSessaoJogador(getDb());
  if (!sessao) redirect('/entrar');
  return (
    <Tela>
      <Topo />
      <TrocarPin nome={sessao.nome} />
    </Tela>
  );
}
