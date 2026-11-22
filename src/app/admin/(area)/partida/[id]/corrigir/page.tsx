import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { idValido } from '@/server/erros';
import { peladaDaPartida } from '@/server/anotador';
import { acessoNaPelada, destinoSemAcesso, lerAcessoPartidas } from '@/server/sessao';
import { lerEstado } from '../estado';
import { Correcao } from './Correcao';

export const metadata: Metadata = { title: 'Corrigir partida · Pelada' };

export default async function CorrigirPage({ params }: PageProps<'/admin/partida/[id]/corrigir'>) {
  const db = getDb();
  const id = Number((await params).id);
  const acesso = await lerAcessoPartidas(db);
  // Admin: qualquer partida; anotador: só as da pelada do link.
  if (acesso?.tipo !== 'admin' && !acessoNaPelada(acesso, idValido(id) ? await peladaDaPartida(db, id) : null)) redirect(destinoSemAcesso(acesso));
  const estado = idValido(id) ? await lerEstado(db, id) : null;
  // Inexistente ou ainda rolando: o anotador explica (e é lá que se mexe numa partida em andamento).
  if (!estado || !estado.encerrada) redirect(`/admin/partida/${(await params).id}`);
  return <Correcao estado={estado} />;
}
