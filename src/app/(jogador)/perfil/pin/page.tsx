import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Tela, Topo } from '@/components/topo';
import { getDb } from '@/db/client';
import { lerSessaoJogador } from '@/server/sessao';
import { TrocarMeuPin } from './trocar-meu-pin';

export const metadata: Metadata = { title: 'Trocar PIN · Pelada' };

export default async function TrocarMeuPinPage() {
  const sessao = await lerSessaoJogador(getDb());
  if (!sessao) redirect('/entrar');
  if (sessao.precisaTrocar) redirect('/trocar-pin');
  return (
    <Tela>
      <Topo inicio="/lista" />
      <TrocarMeuPin />
    </Tela>
  );
}
