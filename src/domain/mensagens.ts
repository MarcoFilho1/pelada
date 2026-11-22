/** Mensagem que o usuário vê quando algo inesperado quebra (o detalhe fica só no log do servidor). */
export const MSG_ALGO_DEU_ERRADO = 'Algo deu errado. Tente de novo.';

/** Avisos que a tela de entrada mostra depois de uma troca de PIN/senha cujo cookie novo não saiu (`?aviso=`). */
const AVISOS_DE_ENTRADA = {
  pin_trocado: 'PIN trocado. Entre com o PIN novo.',
  senha_trocada: 'Senha trocada. Entre com a senha nova.',
} as const;

/** Só valores da lista valem; qualquer outra coisa na URL some. */
export function avisoDeEntrada(valor: unknown): string | null {
  return typeof valor === 'string' && Object.hasOwn(AVISOS_DE_ENTRADA, valor)
    ? AVISOS_DE_ENTRADA[valor as keyof typeof AVISOS_DE_ENTRADA]
    : null;
}
