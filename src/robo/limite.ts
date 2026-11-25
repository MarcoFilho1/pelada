// Recusa por limite de envio (anti-ban do ZapGate): a mensagem não saiu, mas pode sair depois.
// Fica num arquivo próprio para o `responder` não carregar nada do WhatsApp.

export type TipoDeLimite = 'minuto' | 'hora' | 'dia';

/** A mensagem foi para a fila do ZapGate, mas não deu para confirmar o fim: pode ter saído (toda ou em parte). */
export class EnvioIncerto extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'EnvioIncerto';
  }
}

export class ErroDeLimite extends Error {
  constructor(
    mensagem: string,
    readonly tipo: TipoDeLimite,
    /** Quanto esperar até uma nova tentativa poder passar. */
    readonly esperarMs: number,
  ) {
    super(mensagem);
    this.name = 'ErroDeLimite';
  }
}

/** Quanto, no total, um aviso espera o limite de envio liberar antes de desistir. */
export const ESPERA_MAXIMA_DO_AVISO_MS = 30 * 60_000;

/**
 * Tenta o envio e, se o limite por minuto ou por hora recusar, espera o que o limite pede e tenta
 * de novo, até `maximoMs` no total. Serve para os avisos que o robô começa (aos organizadores):
 * antes, um aviso recusado pelo limite era perdido e ninguém ficava sabendo dos times.
 * Limite do dia e qualquer outro erro sobem na hora.
 */
export async function comEsperaDoLimite<T>(
  enviar: () => Promise<T>,
  op: { maximoMs?: number; dormir?: (ms: number) => Promise<void>; aoEsperar?: (tipo: TipoDeLimite, ms: number) => void } = {},
): Promise<T> {
  const maximo = op.maximoMs ?? ESPERA_MAXIMA_DO_AVISO_MS;
  const dormir = op.dormir ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  let esperou = 0;
  for (;;) {
    try {
      return await enviar();
    } catch (err) {
      if (!(err instanceof ErroDeLimite) || err.tipo === 'dia') throw err;
      // Um pouco além do que o limite pede: a vaga abre de verdade e a próxima tentativa passa.
      const espera = Math.max(5_000, err.esperarMs + 2_000);
      if (esperou + espera > maximo) throw err;
      op.aoEsperar?.(err.tipo, espera);
      await dormir(espera);
      esperou += espera;
    }
  }
}
