import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { dataDe, diaMes } from '@/domain/tempo';
import { listarJogadores } from '@/server/jogadores';
import { partidaEmAndamento } from '@/server/partidas';
import { peladaDoDia } from '@/server/pelada';
import { estadoDaPelada } from '@/server/presencas';
import { lerSessaoAdmin } from '@/server/sessao';
import { participantesPadrao, temPartida, timesDaPelada } from '@/server/times';
import { SorteioAdmin } from './sorteio-admin';

export const metadata: Metadata = { title: 'Sorteio · Pelada' };

export default async function SorteioPage() {
  const db = getDb();
  if (!(await lerSessaoAdmin(db))) redirect('/admin/entrar');
  const now = new Date();
  const pelada = await peladaDoDia(db, now);

  if (!pelada) {
    return (
      <main className="flex flex-1 flex-col pb-8">
        <h1 className="mt-6 font-placa text-titulo font-semibold">Sorteio</h1>
        <p className="mt-2 text-base text-apagado">
          Ainda não tem pelada para sortear. Ela aparece aqui no dia, depois que a lista da semana abrir.
        </p>
      </main>
    );
  }

  const [times, jaTemPartida, emAndamento, ativos, padrao, estado] = await Promise.all([
    timesDaPelada(db, pelada.id),
    temPartida(db, pelada.id),
    partidaEmAndamento(db, pelada.id),
    listarJogadores(db, { incluirInativos: false }),
    participantesPadrao(db, pelada.id, now),
    estadoDaPelada(db, pelada.id, now),
  ]);
  const ativosPorId = new Set(ativos.map((j) => j.id));
  // Com times salvos, quem já está neles é quem está na quadra; sem times, os confirmados da lista.
  const marcados = times.length
    ? times.flatMap((t) => t.jogadores.map((j) => j.id)).filter((id) => ativosPorId.has(id))
    : padrao.map((j) => j.id);
  const jaMarcados = new Set(marcados);
  // Quem está na lista sem confirmar ou na fila aparece desmarcado, para incluir com um toque.
  const sugeridos = [...estado.principal, ...estado.fila].map((i) => i.jogadorId).filter((id) => !jaMarcados.has(id));

  return (
    <SorteioAdmin
      peladaId={pelada.id}
      data={diaMes(pelada.data)}
      hoje={pelada.data === dataDe(now)}
      cancelada={pelada.estadoManual === 'cancelada'}
      ativos={ativos.map((j) => ({ id: j.id, nome: j.nome, nota: j.nota }))}
      marcados={marcados}
      sugeridos={sugeridos}
      times={times}
      temPartida={jaTemPartida}
      emAndamento={emAndamento}
    />
  );
}
