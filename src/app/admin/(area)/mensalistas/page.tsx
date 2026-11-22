import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { mesDaQuarta, proximaQuarta } from '@/domain/tempo';
import { listarJogadores } from '@/server/jogadores';
import { mesValido, previaMensalistasDoMes } from '@/server/mensalistas';
import { lerSessaoAdmin } from '@/server/sessao';
import { MensalistasAdmin } from './mensalistas-admin';

export const metadata: Metadata = { title: 'Mensalistas · Pelada' };

export default async function MensalistasPage({ searchParams }: PageProps<'/admin/mensalistas'>) {
  const db = getDb();
  if (!(await lerSessaoAdmin(db))) redirect('/admin/entrar');
  const pedido = (await searchParams).mes;
  const mes = typeof pedido === 'string' && mesValido(pedido) ? pedido : mesDaQuarta(proximaQuarta(new Date()));
  const [jogadores, previa] = await Promise.all([
    listarJogadores(db, { incluirInativos: false }),
    previaMensalistasDoMes(db, mes),
  ]);
  return (
    <MensalistasAdmin
      key={mes}
      mes={mes}
      jogadores={jogadores.map((j) => ({ id: j.id, nome: j.nome }))}
      marcados={previa.ids}
      copiadoDe={previa.origem}
    />
  );
}
