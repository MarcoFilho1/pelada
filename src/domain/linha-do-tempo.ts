// A linha do tempo de uma partida: os gols em ordem, cada um com a assistência que o gerou.
//
// O banco não liga a assistência ao gol (são dois toques separados no anotador), então a ligação é
// pela proximidade: uma assistência do mesmo lado, de outra pessoa, até 60 s antes ou depois do gol.
// A que sobrar aparece sozinha.

import type { Lado } from './partida';

/** Assistência e gol tocados com até isto de diferença são o mesmo lance. */
export const JANELA_ASSISTENCIA_MS = 60_000;

export type LanceNoTempo = {
  id: number;
  jogadorId: number;
  tipo: 'gol' | 'assistencia';
  lado: Lado;
  /** Tempo de jogo do lance; null = sem hora (posto depois, em Corrigir). */
  tempoMs: number | null;
};

export type EventoDaLinha =
  | { tipo: 'gol'; lado: Lado; tempoMs: number | null; autor: number; assistencia: number | null; placar: { A: number; B: number } }
  | { tipo: 'assistencia'; lado: Lado; tempoMs: number | null; autor: number };

const emOrdem = (a: LanceNoTempo, b: LanceNoTempo) =>
  (a.tempoMs === null ? 1 : 0) - (b.tempoMs === null ? 1 : 0) || (a.tempoMs ?? 0) - (b.tempoMs ?? 0) || a.id - b.id;

export function linhaDoTempo(lances: LanceNoTempo[]): EventoDaLinha[] {
  const ordem = [...lances].sort(emOrdem);
  const usadas = new Set<number>();
  const assistencias = ordem.filter((l) => l.tipo === 'assistencia');
  const placar = { A: 0, B: 0 };
  const eventos: EventoDaLinha[] = [];
  for (const l of ordem) {
    if (l.tipo === 'gol') {
      let melhor: LanceNoTempo | null = null;
      if (l.tempoMs !== null) {
        for (const a of assistencias) {
          if (usadas.has(a.id) || a.lado !== l.lado || a.jogadorId === l.jogadorId || a.tempoMs === null) continue;
          const d = Math.abs(a.tempoMs - l.tempoMs);
          if (d <= JANELA_ASSISTENCIA_MS && (!melhor || d < Math.abs(melhor.tempoMs! - l.tempoMs))) melhor = a;
        }
      }
      if (melhor) usadas.add(melhor.id);
      placar[l.lado]++;
      eventos.push({ tipo: 'gol', lado: l.lado, tempoMs: l.tempoMs, autor: l.jogadorId, assistencia: melhor?.jogadorId ?? null, placar: { ...placar } });
    }
  }
  // As assistências que não acharam gol entram na ordem do tempo.
  for (const a of assistencias) {
    if (usadas.has(a.id)) continue;
    eventos.push({ tipo: 'assistencia', lado: a.lado, tempoMs: a.tempoMs, autor: a.jogadorId });
  }
  return eventos.sort(
    (a, b) => (a.tempoMs === null ? 1 : 0) - (b.tempoMs === null ? 1 : 0) || (a.tempoMs ?? 0) - (b.tempoMs ?? 0),
  );
}
