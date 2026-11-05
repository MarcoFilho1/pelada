import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { lerSessaoJogador } from '@/server/sessao';

// Guarda da área do jogador. O proxy só confere a assinatura do cookie; aqui a sessão é
// conferida no banco (revogada, jogador inativo, PIN zerado pelo admin).
export default async function AreaJogadorLayout({ children }: LayoutProps<'/'>) {
  const sessao = await lerSessaoJogador(getDb());
  if (!sessao) redirect('/entrar');
  if (sessao.precisaTrocar) redirect('/trocar-pin');
  return children;
}
