/** Mensagem que o usuário vê quando algo inesperado quebra (o detalhe fica só no log do servidor). */
export const MSG_ALGO_DEU_ERRADO = 'Algo deu errado. Tente de novo.';

/**
 * Erro de regra ou de validação: a mensagem é em português, pensada para o usuário, e pode
 * ir para a tela. Qualquer outro erro (banco, rede, bug) vira `MSG_ALGO_DEU_ERRADO`.
 */
export class ErroDeValidacao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroDeValidacao';
  }
}

/** Maior inteiro de uma coluna `integer`/`serial` do Postgres. */
const MAX_INT4 = 2_147_483_647;

/** Id vindo do cliente: inteiro de 1 a 2³¹−1. Fora disso o Postgres estouraria, então nem chega lá. */
export function idValido(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= MAX_INT4;
}

/** O que mostrar ao usuário: a mensagem de um erro conhecido, ou a genérica (e o erro vai pro log). */
export function mensagemParaUsuario(e: unknown): string {
  if (e instanceof ErroDeValidacao) return e.message;
  console.error(e);
  return MSG_ALGO_DEU_ERRADO;
}
