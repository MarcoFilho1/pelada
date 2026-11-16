import { normalizarNome } from '@/domain/nome';
import type { QtdDeTimes } from '@/domain/sorteio';
import { lerCadastro, MAX_CADASTROS_POR_MENSAGEM, TEXTO_COMO_CADASTRAR, type PessoaPedida } from '@/robo/cadastro-zap';
import { juntarNomes } from '@/robo/foto';
import type { EstadoDaSemana } from '@/server/presencas';

export type AcaoNaLista = 'adicionar' | 'confirmar' | 'remover';
export type Consulta = 'artilheiro' | 'garcom' | 'ranking' | 'times';
type Simples = 'lista' | 'falta' | 'fila' | 'ajuda' | 'sim' | 'anotar' | Consulta;

export type Comando =
  | { tipo: Simples }
  /** "sortear" (4 times) ou "sortear 3 times". */
  | { tipo: 'sortear'; times: QtdDeTimes }
  | { tipo: AcaoNaLista; nome: string }
  /** Vários nomes numa só mensagem: até `MAX_NOMES_POR_MENSAGEM` em `nomes`; `excedeu` se havia mais. */
  | { tipo: AcaoNaLista; nome: string; nomes: string[]; excedeu: boolean }
  /** Jogadores novos (só organizadores): até `MAX_CADASTROS_POR_MENSAGEM` em `pessoas`; `excedeu` se havia mais. */
  | { tipo: 'cadastrar'; pessoas: PessoaPedida[]; excedeu: boolean }
  /** Só no privado dos organizadores: as notas, mudar uma nota e o link do site. */
  | { tipo: 'notas' }
  | { tipo: 'nota'; nome: string; nota: number }
  | { tipo: 'site' }
  | { tipo: 'pergunta'; texto: string }
  /** Comando reconhecido mas recusado antes de chegar ao site; `texto` é a resposta. */
  | { tipo: 'recusa'; texto: string };

/** Nome maior que isto nem é procurado (e nunca é repetido no grupo). */
export const TAM_MAX_NOME_PEDIDO = 40;
export const MAX_NOMES_POR_MENSAGEM = 3;
export const TEXTO_NOME_COMPRIDO = '🤔 Nome muito comprido.';

export const CONSULTAS: readonly Consulta[] = ['artilheiro', 'garcom', 'ranking', 'times'];

const PALAVRAS: Record<string, Simples> = {
  lista: 'lista',
  falta: 'falta',
  'falta confirmar': 'falta',
  'quem falta': 'falta',
  'quem falta confirmar': 'falta',
  fila: 'fila',
  ajuda: 'ajuda',
  sim: 'sim',
  artilheiro: 'artilheiro',
  artilheiros: 'artilheiro',
  artilharia: 'artilheiro',
  garcom: 'garcom',
  garcons: 'garcom',
  ranking: 'ranking',
  times: 'times',
  anotar: 'anotar',
  'link anotar': 'anotar',
  'link de anotar': 'anotar',
  'link para anotar': 'anotar',
  'link pra anotar': 'anotar',
  'link do anotador': 'anotar',
  anotador: 'anotar',
};

export const TEXTO_SO_3_OU_4 = '🤔 Só sorteio em 3 ou 4 times.';

const NUMEROS: Record<string, number> = { um: 1, dois: 2, tres: 3, quatro: 4, cinco: 5, seis: 6 };

/**
 * "sortear", "sorteia de novo", "sortear 3", "sortear em 3 times", "sortear de novo três times" (já sem acento e
 * minúsculo). As mensagens de erro do sorteio pedem "Peça *sortear* de novo". Número que não é 3 nem 4: recusa curta.
 * Outra coisa depois do "sortear" (ex.: "sortear os times aí"): `null`, vira pergunta livre.
 */
function comandoDeSortear(limpo: string): Extract<Comando, { tipo: 'sortear' | 'recusa' }> | null {
  const m = /^(?:sortear|sorteia|sorteio)(?: (?:de novo|novamente))?(?: (?:em )?(\d{1,2}|[a-z]+)(?: times?)?)?$/.exec(limpo);
  if (!m) return null;
  if (m[1] === undefined) return { tipo: 'sortear', times: 4 };
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMEROS[m[1]];
  if (n === undefined) return null;
  return n === 3 || n === 4 ? { tipo: 'sortear', times: n } : { tipo: 'recusa', texto: TEXTO_SO_3_OU_4 };
}

/** Primeira palavra (já sem acento) → ação na lista. */
const ACOES: Record<string, AcaoNaLista> = {
  adicionar: 'adicionar',
  confirmar: 'confirmar',
  remover: 'remover',
  remove: 'remover',
};

/** "adicionar [na] [lista] <nome>" → o nome como foi escrito (sem pontuação no fim); `null` sem nome. */
function comandoDeLista(texto: string): Extract<Comando, { tipo: AcaoNaLista | 'recusa' }> | null {
  const palavras = texto.trim().split(/\s+/);
  const tipo = ACOES[normalizarNome(palavras[0] ?? '')];
  if (!tipo) return null;
  let resto = palavras.slice(1);
  if (tipo === 'adicionar') {
    if (normalizarNome(resto[0] ?? '') === 'na' && normalizarNome(resto[1] ?? '') === 'lista') resto = resto.slice(2);
    else if (normalizarNome(resto[0] ?? '') === 'lista') resto = resto.slice(1);
  }
  const nome = resto.join(' ').replace(/[\s.,;:!?]+$/u, '').trim();
  if (!nome) return null;
  // Vírgulas e " e " separam nomes (só o "e"; "é" não separa).
  const todos = nome.split(/\s*,\s*|\s+[eE]\s+/u).map((n) => n.trim()).filter(Boolean);
  if (todos.length > 1) {
    return { tipo, nome: todos[0], nomes: todos.slice(0, MAX_NOMES_POR_MENSAGEM), excedeu: todos.length > MAX_NOMES_POR_MENSAGEM };
  }
  if (todos.length === 0) return null;
  if (todos[0].length > TAM_MAX_NOME_PEDIDO) return { tipo: 'recusa', texto: TEXTO_NOME_COMPRIDO };
  return { tipo, nome: todos[0] };
}

const CADASTRAR = new Set(['cadastrar', 'cadastra', 'cadastre', 'cadastro']);

/** "cadastrar Caio - 2,5 João - 3" (ou várias linhas) → pessoas; sem ninguém, o jeito de mandar. */
function comandoDeCadastro(texto: string): Extract<Comando, { tipo: 'cadastrar' | 'recusa' }> | null {
  const m = /^\s*(\S+)(?:\s+([\s\S]*))?$/u.exec(texto);
  if (!m || !CADASTRAR.has(normalizarNome(m[1]).replace(/[.,:;!?]+$/u, ''))) return null;
  const pessoas = lerCadastro(m[2] ?? '');
  if (!pessoas.length) return { tipo: 'recusa', texto: TEXTO_COMO_CADASTRAR };
  return { tipo: 'cadastrar', pessoas: pessoas.slice(0, MAX_CADASTROS_POR_MENSAGEM), excedeu: pessoas.length > MAX_CADASTROS_POR_MENSAGEM };
}

/** Texto da mensagem sem a marcação → comando. Sobra de texto depois do comando é pergunta livre. */
export function interpretar(textoSemMarcacao: string): Comando {
  const limpo = normalizarNome(textoSemMarcacao).replace(/[\s.,;:!?]+$/u, '').trim();
  if (limpo === '') return { tipo: 'lista' };
  const tipo = PALAVRAS[limpo];
  if (tipo) return { tipo };
  const sortear = comandoDeSortear(limpo);
  if (sortear) return sortear;
  const cadastro = comandoDeCadastro(textoSemMarcacao);
  if (cadastro) return cadastro;
  const deLista = comandoDeLista(textoSemMarcacao);
  if (deLista) return deLista;
  return { tipo: 'pergunta', texto: textoSemMarcacao.trim().replace(/\s+/g, ' ') };
}

const SITE = new Set(['site', 'link', 'link do site', 'o site', 'endereco', 'endereco do site', 'url']);

/**
 * Privado de organizador: "notas", "nota Fulano 3,5" (também "nota do Fulano: 3.5", "nota Fulano pra 3"),
 * "site"/"link"; o resto como no grupo.
 */
export function interpretarPrivado(texto: string): Comando {
  const limpo = normalizarNome(texto).replace(/[\s.,;:!?]+$/u, '').trim();
  if (limpo === 'notas' || limpo === 'ver notas' || limpo === 'nota') return { tipo: 'notas' };
  if (SITE.has(limpo)) return { tipo: 'site' };
  const m = /^\s*notas?\s+(?:d[aeo]s?\s+)?(.+?)\s*(?:-|:|=|\bpara\b|\bpra\b|\bvai pra\b)?\s*(\d+(?:[.,]\d+)?)\s*[.!]?\s*$/iu.exec(texto);
  if (m && m[1].trim()) {
    const nome = m[1].trim();
    if (nome.length > TAM_MAX_NOME_PEDIDO) return { tipo: 'recusa', texto: TEXTO_NOME_COMPRIDO };
    return { tipo: 'nota', nome, nota: Number(m[2].replace(',', '.')) };
  }
  return interpretar(texto);
}

export function respostaFalta(estado: EstadoDaSemana): string {
  const pendentes = estado.principal.filter((i) => !i.confirmado).map((i) => i.nome);
  if (!pendentes.length) return '🙌 Todo mundo da lista já confirmou!';
  return `⏳ Ainda não confirmaram: ${juntarNomes(pendentes)}.`;
}

export function respostaFila(estado: EstadoDaSemana): string {
  if (!estado.fila.length) return '📝 Ninguém na fila.';
  return `📝 Fila:\n${estado.fila.map((i, n) => `${n + 1}. ${i.nome}`).join('\n')}`;
}

export const TEXTO_AJUDA = [
  '🤖 Oi! Me marque com um comando:',
  '📋 lista — a lista completa da semana',
  '⏳ falta confirmar — quem ainda não confirmou',
  '📝 fila — quem está na fila',
  '➕ adicionar Nome — põe na lista (ou na fila, se estiver cheia) — até 3 nomes: A, B e C',
  '✅ confirmar Nome — confirma quem está na lista — até 3 nomes: A, B e C',
  '👋 remover Nome — tira da lista ou da fila — até 3 nomes: A, B e C',
  '⚽ artilheiro · 🎯 garçom · 🏆 ranking — os primeiros do mês',
  '👕 times — os times de hoje',
  '🎲 sortear (ou sortear 3 times) — só os organizadores',
  '🆕 cadastrar Nome - nota — jogador novo (ex.: Caio - 2,5, João - 3) — só os organizadores',
  '📝 anotar — link para anotar as partidas de hoje, sem senha — só os organizadores',
].join('\n');

/** No privado, o `ajuda` ganha os comandos de organizador. */
export const TEXTO_AJUDA_ORGANIZADOR = [
  '🔐 Aqui no privado, só para organizadores:',
  '📋 notas — todos os jogadores com a nota',
  '✏️ nota Fulano 3,5 — muda a nota',
  '🆕 cadastrar Nome - nota — jogador novo',
  '🌐 site — o link do site',
  '📝 anotar — link para anotar as partidas de hoje',
].join('\n');

/** Com as perguntas livres ligadas, o `ajuda` lembra delas. */
export const TEXTO_AJUDA_PERGUNTA = '💬 Ou faça uma pergunta, por exemplo: @robô o João está na lista?';
