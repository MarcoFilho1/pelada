import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { mesDe } from '@/domain/tempo';
import { listarJogadores } from '@/server/jogadores';
import { mesValido, previaMensalistasDoMes } from '@/server/mensalistas';
import { lerSessaoAdmin } from '@/server/sessao';
import { MensalistasAdmin } from './mensalistas-admin';

export const metadata: Metadata = { title: 'Mensalistas · Pelada' };

const DIA = 24 * 60 * 60 * 1000;
const RECIFE = -3 * 60 * 60 * 1000;

/** Mês da próxima quarta (hoje, se for quarta), no fuso de Recife. */
function mesDaProximaQuarta(agora: Date): string {
  const local = new Date(agora.getTime() + RECIFE);
  const falta = (3 - local.getUTCDay() + 7) % 7;
  return mesDe(new Date(agora.getTime() + falta * DIA));
}

export default async function MensalistasPage({ searchParams }: PageProps<'/admin/mensalistas'>) {
  const db = getDb();
  if (!(await lerSessaoAdmin(db))) redirect('/admin/entrar');
  const pedido = (await searchParams).mes;
  const mes = typeof pedido === 'string' && mesValido(pedido) ? pedido : mesDaProximaQuarta(new Date());
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
