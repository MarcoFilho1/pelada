// Pelada sem horário de verão: Recife é sempre UTC-03:00.
const OFFSET_RECIFE_MS = -3 * 60 * 60 * 1000;

/** Mês ('YYYY-MM') da data no fuso de Recife. */
export function mesDe(data: Date): string {
  return new Date(data.getTime() + OFFSET_RECIFE_MS).toISOString().slice(0, 7);
}
