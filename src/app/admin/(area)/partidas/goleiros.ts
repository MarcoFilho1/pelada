// A escolha de goleiro na tela da noite, sem React: quem pode agarrar e a sugestão.

export type Goleiros = { A: number | null; B: number | null };
export type Anterior = { jogadorId: number; timeId: number };

/**
 * Sugestão para a partida entre `timeA` e `timeB`: quem agarrou na partida anterior continua no
 * mesmo time, se esse time joga de novo; quem sobrar ocupa o lado vazio (A antes de B). Só entra
 * quem `pode` agarrar agora (não está num dos dois times).
 */
export function sugerirGoleiros(timeA: number, timeB: number, anteriores: Anterior[], pode: (id: number) => boolean): Goleiros {
  const g: Goleiros = { A: null, B: null };
  const livres = anteriores.filter((a) => pode(a.jogadorId));
  const usados = new Set<number>();
  for (const a of livres) {
    const lado = a.timeId === timeA ? 'A' : a.timeId === timeB ? 'B' : null;
    if (lado && g[lado] === null) {
      g[lado] = a.jogadorId;
      usados.add(a.jogadorId);
    }
  }
  for (const a of livres) {
    if (usados.has(a.jogadorId)) continue;
    const lado = g.A === null ? 'A' : g.B === null ? 'B' : null;
    if (!lado) break;
    g[lado] = a.jogadorId;
    usados.add(a.jogadorId);
  }
  return g;
}

/** Ids no formato que o servidor recebe, ou null se não é um par válido (repetido, id ruim). */
export function goleirosValidos(g: unknown): g is Goleiros {
  if (!g || typeof g !== 'object') return false;
  const { A, B } = g as Record<string, unknown>;
  const ok = (v: unknown) => v === null || (typeof v === 'number' && Number.isInteger(v) && v > 0);
  return ok(A) && ok(B) && (A === null || A !== B);
}
