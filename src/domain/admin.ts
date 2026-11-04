/** Tamanho mínimo da senha de admin: vale no seed, na criação de admin e na troca de senha. */
export const TAM_MIN_SENHA_ADMIN = 10;

export const MSG_SENHA_CURTA = `A senha precisa ter pelo menos ${TAM_MIN_SENHA_ADMIN} caracteres.`;

export function senhaAdminValida(senha: string): boolean {
  return senha.length >= TAM_MIN_SENHA_ADMIN;
}
