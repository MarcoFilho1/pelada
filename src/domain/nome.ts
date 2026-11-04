/** Nome sem acento e sem diferença de maiúsculas ("João" e "JOAO" viram "joao"), para buscar e comparar. */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
