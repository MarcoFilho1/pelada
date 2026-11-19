// Regras de uma partida: placar, resultado, cronômetro e a próxima partida da noite.

/** A partida dura 8 minutos de jogo (o cronômetro sobe de 0:00 e pode ser pausado). */
export const DURACAO_MS = 8 * 60_000;
/** Ou acaba antes, quando um time chega a 3 gols. */
export const GOLS_PARA_VENCER = 3;

export type Lado = 'A' | 'B';
export type TipoLance = 'gol' | 'assistencia';
export type Resultado = 'A' | 'B' | 'empate';
export type Placar = { A: number; B: number };
/**
 * Uma partida encerrada, do jeito que a fila precisa: quem jogou e quem venceu. `desempate`: no
 * empate, o lado que ganhou na moeda e volta primeiro (sem moeda, o A).
 */
export type PartidaJogada = { timeA: number; timeB: number; resultado: Resultado; desempate?: Lado | null };

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

/** O que o cronômetro precisa: quando começou, o tempo já pausado e, se está pausada, desde quando. */
export type Cronometro = { iniciadaEm: Date; pausadoMs: number; pausadaEm: Date | null };

/**
 * Tempo de jogo: do início até agora (ou até a pausa em curso), menos o tempo já pausado. Sobe
 * de 0:00 e passa de 8:00 (os acréscimos). Nunca negativo (relógio do servidor antes do início).
 */
export function tempoDeJogoMs(c: Cronometro, now: Date): number {
  const ate = c.pausadaEm && c.pausadaEm < now ? c.pausadaEm : now;
  return Math.max(0, ate.getTime() - c.iniciadaEm.getTime() - c.pausadoMs);
}

/** Cronômetro na tela: 'm:ss' do tempo de jogo, com o segundo cortado (só mostra 8:00 quando chegou). */
export function relogio(tempoMs: number): string {
  const s = Math.floor(Math.max(0, tempoMs) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Depois dos 8:00: quanto passou ('+0:12'); antes, null. */
export function acrescimo(tempoMs: number): string | null {
  return tempoMs > DURACAO_MS && relogio(tempoMs - DURACAO_MS) !== '0:00' ? `+${relogio(tempoMs - DURACAO_MS)}` : null;
}

/** Minuto do lance como o cronômetro mostrava: 2:09 é o 2' (o desenho aprovado). */
export function minutoDoLance(tempoMs: number): number {
  return Math.floor(Math.max(0, tempoMs) / 60_000);
}

/**
 * Hora de sugerir o encerramento (o site só sugere; quem encerra é o admin): 3 gols de um
 * time têm prioridade sobre o tempo esgotado.
 */
export function sugerirEncerrar(p: Placar, tempoMs: number): null | 'tres_gols' | 'tempo' {
  if (p.A >= GOLS_PARA_VENCER || p.B >= GOLS_PARA_VENCER) return 'tres_gols';
  if (tempoMs >= DURACAO_MS) return 'tempo';
  return null;
}

/**
 * A fila depois de uma partida (`fila` = ordem antes dela, os primeiros entram antes). Quem perde
 * sai: o vencedor vai para a frente e o perdedor para o fim. Se empatar, saem os dois e vão para
 * o fim: primeiro quem ganhou na moeda (sem moeda, o A). A partida pode ter sido qualquer uma (o
 * admin escolhe livremente).
 */
export function filaDepois(fila: number[], partida: PartidaJogada): number[] {
  const { timeA, timeB, resultado } = partida;
  const resto = fila.filter((t) => t !== timeA && t !== timeB);
  const naFila = (ts: number[]) => ts.filter((t) => fila.includes(t));
  if (resultado === 'empate') return [...resto, ...naFila(partida.desempate === 'B' ? [timeB, timeA] : [timeA, timeB])];
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

/** Chance de quem jogou menos partidas na noite ganhar na moeda (o outro fica com o resto). */
export const CHANCE_DE_QUEM_JOGOU_MENOS = 0.7;

/**
 * A moeda do empate, que na tela é cara ou coroa: a chance do lado A ganhar. Com o mesmo número
 * de partidas na noite é meio a meio; senão, quem jogou menos tem 70%.
 */
export function chanceDoA(jogosA: number, jogosB: number): number {
  if (jogosA === jogosB) return 0.5;
  return jogosA < jogosB ? CHANCE_DE_QUEM_JOGOU_MENOS : 1 - CHANCE_DE_QUEM_JOGOU_MENOS;
}

/** Um empate cujos dois times ainda não voltaram a jogar: a ordem entre eles é a moeda. */
export type EmpateNaFila = { partidaId: number; x: number; y: number; desempate: Lado | null };

/**
 * A fila da noite e os empates que ainda importam: cada empate (com os dois times na fila) entra
 * na lista e sai quando um dos dois joga de novo.
 */
export function filaDaNoite(
  times: number[],
  jogadas: (PartidaJogada & { id: number })[],
): { fila: number[]; empates: EmpateNaFila[] } {
  let fila = times;
  let empates: EmpateNaFila[] = [];
  for (const p of jogadas) {
    empates = empates.filter((e) => ![p.timeA, p.timeB].some((t) => t === e.x || t === e.y));
    fila = filaDepois(fila, p);
    if (p.resultado === 'empate' && fila.includes(p.timeA) && fila.includes(p.timeB)) {
      empates.push({ partidaId: p.id, x: p.timeA, y: p.timeB, desempate: p.desempate ?? null });
    }
  }
  return { fila, empates };
}

/**
 * A moeda da próxima partida: o empate em que um dos dois times entra agora e o outro espera (um
 * nos dois primeiros da fila, o outro depois). `fixo` = o adversário já certo. `desempate` null =
 * falta jogar; com lado, a moeda já foi jogada. Null: a próxima partida não depende de moeda.
 */
export function moedaDaProxima(fila: number[], empates: EmpateNaFila[]): (EmpateNaFila & { fixo: number }) | null {
  for (const e of empates) {
    const [px, py] = [fila.indexOf(e.x), fila.indexOf(e.y)];
    if (Math.min(px, py) > 1 || Math.max(px, py) < 2) continue;
    const fixo = fila.slice(0, 2).find((t) => t !== e.x && t !== e.y);
    if (fixo !== undefined) return { ...e, fixo };
  }
  return null;
}
