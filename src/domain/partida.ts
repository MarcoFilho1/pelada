// Regras de uma partida: placar, resultado, cronômetro e a próxima partida da noite.

/** A partida dura 8 minutos, com o cronômetro correndo direto. */
export const DURACAO_MS = 8 * 60_000;
/** Ou acaba antes, quando um time chega a 3 gols. */
export const GOLS_PARA_VENCER = 3;

export type Lado = 'A' | 'B';
export type TipoLance = 'gol' | 'assistencia';
export type Resultado = 'A' | 'B' | 'empate';
export type Placar = { A: number; B: number };
/** Uma partida encerrada, do jeito que a fila precisa: quem jogou e quem venceu. */
export type PartidaJogada = { timeA: number; timeB: number; resultado: Resultado };

/**
 * Placar = soma dos gols dos jogadores de cada lado (não existe gol contra). Assistência não
 * conta, e lance de quem não está em `lados` é ignorado.
 */
export function placar(lances: { jogadorId: number; tipo: TipoLance }[], lados: Map<number, Lado>): Placar {
  const p = { A: 0, B: 0 };
  for (const l of lances) {
    const lado = lados.get(l.jogadorId);
    if (l.tipo === 'gol' && lado) p[lado]++;
  }
  return p;
}

export function resultadoDoPlacar(p: Placar): Resultado {
  return p.A > p.B ? 'A' : p.B > p.A ? 'B' : 'empate';
}

/** Quanto falta para os 8:00, nunca negativo (nem mais que 8:00, se o relógio vier antes do início). */
export function tempoRestanteMs(iniciadaEm: Date, now: Date): number {
  const decorrido = now.getTime() - iniciadaEm.getTime();
  return Math.min(DURACAO_MS, Math.max(0, DURACAO_MS - decorrido));
}

/** Cronômetro na tela: 'm:ss', com o segundo arredondado para cima (só mostra 0:00 quando acabou). */
export function relogio(restanteMs: number): string {
  const s = Math.ceil(Math.max(0, restanteMs) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Hora de sugerir o encerramento (o site só sugere; quem encerra é o admin): 3 gols de um
 * time têm prioridade sobre o tempo esgotado.
 */
export function sugerirEncerrar(p: Placar, iniciadaEm: Date, now: Date): null | 'tres_gols' | 'tempo' {
  if (p.A >= GOLS_PARA_VENCER || p.B >= GOLS_PARA_VENCER) return 'tres_gols';
  if (tempoRestanteMs(iniciadaEm, now) === 0) return 'tempo';
  return null;
}

/**
 * A fila depois de uma partida (`fila` = ordem antes dela, os primeiros entram antes). Quem perde
 * sai: o vencedor vai para a frente e o perdedor para o fim. Se empatar, saem os dois e vão para
 * o fim (A, depois B). A partida pode ter sido qualquer uma (o admin escolhe livremente).
 */
export function filaDepois(fila: number[], partida: PartidaJogada): number[] {
  const { timeA, timeB, resultado } = partida;
  const resto = fila.filter((t) => t !== timeA && t !== timeB);
  const naFila = (ts: number[]) => ts.filter((t) => fila.includes(t));
  if (resultado === 'empate') return [...resto, ...naFila([timeA, timeB])];
  const [vencedor, perdedor] = resultado === 'A' ? [timeA, timeB] : [timeB, timeA];
  return [...naFila([vencedor]), ...resto, ...naFila([perdedor])];
}

/**
 * Sugestão da próxima partida. Sem partida anterior: os dois primeiros da fila. Com vencedor: ele
 * contra o primeiro que não jogou a última. Empate: os dois seguintes da fila. Com 2 times, são
 * sempre os dois. Precisa de pelo menos 2 times.
 */
export function proximaPartidaSugerida(times: number[], ultima: PartidaJogada | null): [number, number] {
  if (times.length < 2) throw new Error('proximaPartidaSugerida: precisa de pelo menos 2 times');
  const fila = ultima ? filaDepois(times, ultima) : times;
  return [fila[0], fila[1]];
}
