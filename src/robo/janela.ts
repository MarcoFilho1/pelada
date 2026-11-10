import { aberturaLista, inicioJogo, proximaQuarta } from '@/domain/tempo';

const HORA_MS = 60 * 60 * 1000;
const SEMANA_MS = 7 * 24 * HORA_MS;

/** Janela em que o robô trabalha: segunda 14:00 → quarta 20:30 (Recife) da semana da quarta. */
export function janelaDaSemana(dataQuarta: string): { inicio: Date; fim: Date } {
  return { inicio: new Date(aberturaLista(dataQuarta).getTime() + 14 * HORA_MS), fim: inicioJogo(dataQuarta) };
}

export function dentroDaJanela(now: Date): boolean {
  const { inicio, fim } = janelaDaSemana(proximaQuarta(now));
  return now >= inicio && now < fim;
}

/** Início da próxima janela (`now` se já está dentro). Entre quarta 20:30 e 22:30 já é a da semana seguinte. */
export function proximaJanela(now: Date): Date {
  const { inicio, fim } = janelaDaSemana(proximaQuarta(now));
  if (now < inicio) return inicio;
  if (now < fim) return now;
  return new Date(inicio.getTime() + SEMANA_MS);
}

/** Quanto dormir até a próxima volta: 60 s dentro da janela; fora, até a janela, no máximo 1 h. */
export function esperaAte(now: Date): number {
  if (dentroDaJanela(now)) return 60_000;
  return Math.max(1_000, Math.min(HORA_MS, proximaJanela(now).getTime() - now.getTime()));
}
