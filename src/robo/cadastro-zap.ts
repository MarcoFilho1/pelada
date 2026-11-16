// "cadastrar Caio - 2,5 João - 3" pelo WhatsApp: lê nomes e notas do texto e monta a resposta.
// Só os organizadores podem (quem confere é o `responder`); a gravação é `cadastrarJogadores` do site.
import type { ResultadoDoCadastro } from '@/server/jogadores';
import { juntarNomes } from './foto';

/** `nota` como foi escrita (ainda sem validar); `null` = veio sem nota (o robô pede a nota antes de cadastrar). */
export type PessoaPedida = { nome: string; nota: number | null };

export const MAX_CADASTROS_POR_MENSAGEM = 10;
export const TEXTO_COMO_CADASTRAR = '🤔 Mande assim: cadastrar Caio - 2,5, João - 3';
export const TEXTO_SO_ADMIN_CADASTRO = '🔐 Só os organizadores podem cadastrar jogadores pelo WhatsApp.';
export const TEXTO_MAX_CADASTROS = `Só cadastro até ${MAX_CADASTROS_POR_MENSAGEM} pessoas por mensagem.`;

// Número com ponto ou vírgula decimal colada ("2.5", "2,5"); "2, 5" são dois números.
const NUMERO = /(\d+(?:[.,]\d+)?)(?!\d)/gu;
const PALAVRAS_MINUSCULAS = new Set(['da', 'das', 'de', 'do', 'dos', 'e']);

/** Tira o que sobra entre um nome e a nota: "- ", ": ", "nota", "com nota", "(" e, no começo, ")", vírgula ou "e". */
function limparTrecho(trecho: string): string {
  let s = trecho.replace(/^[\s,;:)\]\-–—/]+/u, '').replace(/^e\s+/iu, '');
  for (let antes = ''; antes !== s; ) {
    antes = s;
    s = s.replace(/[\s,;(\[\-–—:=]+$/u, '').replace(/\s+(?:com\s+)?nota$/iu, '').replace(/^(?:com\s+)?nota$/iu, '');
  }
  return s.trim();
}

/** Vários nomes no mesmo trecho ("Caio, Pedro e João") dividem a mesma nota. */
function separar(trecho: string): string[] {
  return limparTrecho(trecho)
    .split(/\s*[,;/]\s*|\s+e\s+/iu)
    .map(limparTrecho)
    .filter(Boolean);
}

/** Nome todo em minúsculas ganha iniciais maiúsculas ("joão da silva" → "João da Silva"); o resto fica como veio. */
export function arrumarNome(nome: string): string {
  const limpo = nome.trim().replace(/\s+/g, ' ');
  if (limpo !== limpo.toLocaleLowerCase('pt-BR')) return limpo;
  return limpo
    .split(' ')
    .map((p, i) => (i > 0 && PALAVRAS_MINUSCULAS.has(p) ? p : p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1)))
    .join(' ');
}

/**
 * Texto depois de "cadastrar" → pessoas. Cada número é a nota dos nomes escritos antes dele (desde o
 * número anterior); nomes depois do último número ficam sem nota. Separadores: vírgula, ";", "/", " e "
 * e quebra de linha. "Caio Pedro" sem vírgula é um nome só (nomes compostos existem).
 */
export function lerCadastro(texto: string): PessoaPedida[] {
  const s = texto.replace(/\r?\n/g, ', ');
  const pessoas: PessoaPedida[] = [];
  let desde = 0;
  for (const m of s.matchAll(NUMERO)) {
    const nota = Number(m[1].replace(',', '.'));
    for (const nome of separar(s.slice(desde, m.index))) pessoas.push({ nome: arrumarNome(nome), nota });
    desde = m.index + m[0].length;
  }
  for (const nome of separar(s.slice(desde))) pessoas.push({ nome: arrumarNome(nome), nota: null });
  return pessoas;
}

/** Quem veio sem nota não é cadastrado: o robô pede a nota de cada um. */
export function pedirNotas(nomes: string[]): string {
  const exemplo = nomes
    .slice(0, 2)
    .map((n, i) => `${n} - ${i === 0 ? '2,5' : '3'}`)
    .join(', ');
  return `✍️ Faltou a nota de ${juntarNomes(nomes)}. Mande de novo com a nota, assim: *cadastrar ${exemplo}*`;
}

const notaZap = (n: number) => n.toFixed(1).replace('.', ',');

/** Uma linha por situação, só as que aconteceram; `mudou` quando alguém foi cadastrado. */
export function respostaCadastro(r: ResultadoDoCadastro): { texto: string; mudou: boolean } {
  const linhas: string[] = [];
  if (r.criados.length) {
    const nomes = juntarNomes(r.criados.map((c) => `${c.nome} (${notaZap(c.nota)})`));
    linhas.push(r.criados.length === 1 ? `✅ Cadastrado: ${nomes}.` : `✅ Cadastrados: ${nomes}.`);
  }
  if (r.jaExistiam.length) linhas.push(`👍 Já ${r.jaExistiam.length === 1 ? 'estava cadastrado' : 'estavam cadastrados'}: ${juntarNomes(r.jaExistiam)}.`);
  for (const n of r.notaInvalida) linhas.push(`⚠️ Nota inválida para ${n.nome}: ${String(n.nota).replace('.', ',')}. Use de 0 a 5, de 0,5 em 0,5.`);
  if (r.nomeComprido.length) linhas.push(`⚠️ Nome muito comprido: ${r.nomeComprido.length} ${r.nomeComprido.length === 1 ? 'pessoa' : 'pessoas'} não cadastrada${r.nomeComprido.length === 1 ? '' : 's'}.`);
  return { texto: linhas.join('\n') || TEXTO_COMO_CADASTRAR, mudou: r.criados.length > 0 };
}
