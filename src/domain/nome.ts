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

const MIN_COMECO = 2;

/**
 * Nome escrito → jogador, sem diferenciar maiúsculas e acentos: um só nome inteiro igual vence (dois
 * iguais, como João e Joao, são ambíguos); senão, com 2 letras ou mais, o único que começa com o texto;
 * mais de um → todos (`varios`); nenhum → `null`.
 */
export function acharJogador<T extends { nome: string }>(texto: string, candidatos: T[]): { jogador: T } | { varios: T[] } | null {
  const alvo = normalizarNome(texto);
  if (!alvo) return null;
  const iguais = candidatos.filter((c) => normalizarNome(c.nome) === alvo);
  if (iguais.length === 1) return { jogador: iguais[0] };
  if (iguais.length > 1) return { varios: iguais };
  // Começo do nome só com 2 letras ou mais ("p" acharia gente demais por engano).
  if (alvo.length < MIN_COMECO) return null;
  const comecam = candidatos.filter((c) => normalizarNome(c.nome).startsWith(alvo));
  if (comecam.length === 1) return { jogador: comecam[0] };
  return comecam.length ? { varios: comecam } : null;
}

/** Distância de edição (inserir, apagar, trocar) entre dois textos já normalizados. */
export function levenshtein(a: string, b: string): number {
  let ant = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) atual[j] = Math.min(ant[j] + 1, atual[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    ant = atual;
  }
  return ant[b.length];
}

const DIST_MAX_SUGESTAO = 2;
/** Texto curto (menos de 5 letras) só sugere com 1 de diferença: "bia" não vira "Ana". */
const CURTO = 5;
const MIN_SUGESTAO = 3;

/**
 * Nome parecido com o escrito (distância ≤ 2 contra o nome inteiro ou, se foi escrita uma palavra só,
 * contra cada palavra do nome). Só devolve se um único candidato for o mais próximo; nunca age sobre ele.
 */
export function sugerirNome<T extends { nome: string }>(texto: string, candidatos: T[]): T | null {
  const alvo = normalizarNome(texto);
  if (alvo.length < MIN_SUGESTAO) return null;
  const umaPalavra = !alvo.includes(' ');
  const dist = (c: T) => {
    const n = normalizarNome(c.nome);
    const ds = [levenshtein(alvo, n)];
    if (umaPalavra) for (const p of n.split(' ')) if (p.length >= MIN_SUGESTAO) ds.push(levenshtein(alvo, p));
    return Math.min(...ds);
  };
  const corte = alvo.length < CURTO ? 1 : DIST_MAX_SUGESTAO;
  const com = candidatos.map((c) => ({ c, d: dist(c) })).filter((x) => x.d <= corte);
  if (!com.length) return null;
  const menor = Math.min(...com.map((x) => x.d));
  const melhores = com.filter((x) => x.d === menor);
  return melhores.length === 1 ? melhores[0].c : null;
}
