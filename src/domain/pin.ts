/** PIN com que todo jogador começa (e volta a ter quando o admin zera). */
export const PIN_PADRAO = '1234';

export const MAX_ERROS_PIN = 5;
export const MINUTOS_BLOQUEIO = 15;

/** Exatamente 4 dígitos de 0 a 9. */
export function pinValido(pin: string): boolean {
  return /^[0-9]{4}$/.test(pin);
}

/** PIN aceito na troca: válido e diferente do padrão. */
export function pinNovoValido(pin: string): boolean {
  return pinValido(pin) && pin !== PIN_PADRAO;
}

export function estaBloqueado(bloqueadoAte: Date | null, now: Date): boolean {
  return bloqueadoAte !== null && now.getTime() < bloqueadoAte.getTime();
}

/** Conta um PIN errado. No 5º seguido, bloqueia por 15 min e recomeça a contagem. */
export function registrarErro(erros: number, now: Date): { erros: number; bloqueadoAte: Date | null } {
  const total = erros + 1;
  if (total < MAX_ERROS_PIN) return { erros: total, bloqueadoAte: null };
  return { erros: 0, bloqueadoAte: new Date(now.getTime() + MINUTOS_BLOQUEIO * 60_000) };
}
