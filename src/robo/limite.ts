// Recusa por limite de envio (anti-ban do ZapGate): a mensagem não saiu, mas pode sair depois.
// Fica num arquivo próprio para o `responder` não carregar nada do WhatsApp.

export type TipoDeLimite = 'minuto' | 'hora' | 'dia';

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
