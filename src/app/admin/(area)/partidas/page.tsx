import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { dataDe, diaMes, horaDe } from '@/domain/tempo';
import { filaDeTimes, goleirosDaNoite, historicoDaPelada, moedaDaNoite, partidaAoVivo, partidaEmAndamento, partidasAbertasDeOutrasPeladas } from '@/server/partidas';
import { peladaDoDia, peladaPorId } from '@/server/pelada';
import { acessoNaPelada, LINK_VENCIDO, lerAcessoPartidas } from '@/server/sessao';
import { timesDaPelada } from '@/server/times';
import { Esquecidas, PartidasAdmin } from './partidas-admin';

export const metadata: Metadata = { title: 'Partidas · Pelada' };

export default async function PartidasPage() {
  const db = getDb();
  const now = new Date();
  const acesso = await lerAcessoPartidas(db, now);
  if (!acesso) redirect('/admin/entrar');
  const anotador = acesso.tipo === 'anotador';
  // O anotador vê a pelada do link (pode ter sido gerado antes da quarta); o admin, a do dia.
  const pelada = anotador ? await peladaPorId(db, acesso.peladaId) : await peladaDoDia(db, now);
  if (!acessoNaPelada(acesso, pelada?.id ?? null)) redirect(LINK_VENCIDO);
  // Partida que ninguém encerrou noutra pelada: aparece aqui para não se perder (só para o admin).
  const esquecidas = anotador ? [] : (await partidasAbertasDeOutrasPeladas(db, pelada?.id ?? null)).map((p) => ({ ...p, data: diaMes(p.data) }));

  if (!pelada) {
    return (
      <main className="flex flex-1 flex-col pb-8">
        <h1 className="mt-6 font-placa text-titulo font-semibold">Partidas</h1>
        <p className="mt-2 text-base text-apagado">Ainda não tem pelada. As partidas aparecem aqui no dia, depois do sorteio.</p>
        <Esquecidas partidas={esquecidas} />
      </main>
    );
  }

  const [times, fila, emAndamentoId, historico, goleiros, moeda] = await Promise.all([
    timesDaPelada(db, pelada.id),
    filaDeTimes(db, pelada.id),
    partidaEmAndamento(db, pelada.id),
    historicoDaPelada(db, pelada.id),
    goleirosDaNoite(db, pelada.id),
    moedaDaNoite(db, pelada.id),
  ]);
  const aoVivo = emAndamentoId === null ? null : await partidaAoVivo(db, emAndamentoId, now);

  return (
    <PartidasAdmin
      peladaId={pelada.id}
      data={diaMes(pelada.data)}
      hoje={pelada.data === dataDe(now)}
      cancelada={pelada.estadoManual === 'cancelada'}
      times={times.map((t) => ({ id: t.id, cor: t.cor, jogadores: t.jogadores, completes: t.completes }))}
      fila={fila}
      emAndamento={
        aoVivo && { id: aoVivo.id, corA: aoVivo.lados.A.cor, corB: aoVivo.lados.B.cor, placar: aoVivo.placar }
      }
      historico={historico.map((h) => ({ id: h.id, corA: h.timeA.cor, corB: h.timeB.cor, placar: h.placar, resultado: h.resultado, hora: horaDe(h.iniciadaEm) }))}
      goleiros={goleiros}
      moeda={moeda}
      esquecidas={esquecidas}
      anotador={anotador}
    />
  );
}
