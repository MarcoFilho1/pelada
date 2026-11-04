/** Nome sem acento e sem diferença de maiúsculas ("João" e "JOAO" viram "joao"), para buscar e comparar. */
export function normalizarNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export const TAM_MAX_NOME = 60;

/**
 * Lista colada do WhatsApp para nomes: um por linha, sem numeração ("3. "), sem as marcas
 * (M), (D), (?) e sem os emojis ✅ ⏳. Linhas que sobram vazias somem.
 */
export function parseNomesColados(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((linha) =>
      linha
        .replace(/^\s*\d+\s*[.):\-–]\s*/, '')
        .replace(/\((?:M|D|\?)\)/gi, '')
        .replace(/[✅⏳️]/gu, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((nome) => nome !== '');
}

/**
 * Separa o que entra do que fica de fora: nome grande demais, repetido no lote ou que já
 * existe (Joao = João = JOÃO) é ignorado. Usada na prévia da tela e na criação, para as duas
 * mostrarem a mesma coisa.
 */
export function separarNomes(nomes: string[], existentes: string[]): { criar: string[]; ignorar: string[] } {
  const usados = new Set(existentes.map(normalizarNome));
  const criar: string[] = [];
  const ignorar: string[] = [];
  for (const bruto of nomes) {
    const nome = bruto.trim().replace(/\s+/g, ' ');
    if (!nome) continue;
    const chave = normalizarNome(nome);
    if (nome.length > TAM_MAX_NOME || usados.has(chave)) {
      ignorar.push(nome);
    } else {
      usados.add(chave);
      criar.push(nome);
    }
  }
  return { criar, ignorar };
}
