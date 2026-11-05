import type { DB } from '@/db/client';
import { partidaAoVivo, type PartidaAoVivo } from '@/server/partidas';

/**
 * O que a tela da partida recebe do servidor: `partidaAoVivo` com as datas em milissegundos e
 * `lidoEm`, a hora (do servidor) da leitura. Entre a resposta de um toque e a página recarregada,
 * a tela fica com a leitura mais nova.
 */
export type EstadoDaPartida = Omit<PartidaAoVivo, 'iniciadaEm'> & { iniciadaEm: number; lidoEm: number };

export async function lerEstado(db: DB, partidaId: number): Promise<EstadoDaPartida | null> {
  const agora = new Date();
  const p = await partidaAoVivo(db, partidaId, agora);
  return p && { ...p, iniciadaEm: p.iniciadaEm.getTime(), lidoEm: agora.getTime() };
}
