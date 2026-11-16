import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { TEXTO } from '@/components/pilula';
import { getDb } from '@/db/client';
import { idValido } from '@/server/erros';
import { peladaDaPartida } from '@/server/anotador';
import { acessoNaPelada, destinoSemAcesso, lerAcessoPartidas } from '@/server/sessao';
import { Anotador } from './Anotador';
import { lerEstado } from './estado';

export const metadata: Metadata = { title: 'Anotador · Pelada' };

export default async function PartidaPage({ params }: PageProps<'/admin/partida/[id]'>) {
  const db = getDb();
  const id = Number((await params).id);
  const acesso = await lerAcessoPartidas(db);
  // Admin: qualquer partida; anotador: só as da pelada do link.
  if (acesso?.tipo !== 'admin' && !acessoNaPelada(acesso, idValido(id) ? await peladaDaPartida(db, id) : null)) redirect(destinoSemAcesso(acesso));
  const estado = idValido(id) ? await lerEstado(db, id) : null;

  if (!estado) {
    return (
      <main className="flex flex-1 flex-col">
        <h1 className="mt-6 font-placa text-titulo font-semibold">Partida não encontrada</h1>
        <p className="mt-2 text-base text-apagado">Ela pode ter sido apagada, ou o endereço está errado.</p>
        <Link href="/admin/partidas" className={`-mx-3 mt-4 self-start ${TEXTO}`}>
          Ver as partidas da noite
        </Link>
      </main>
    );
  }
  return <Anotador estado={estado} />;
}
