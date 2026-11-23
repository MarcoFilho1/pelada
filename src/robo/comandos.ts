import { normalizarNome } from '@/domain/nome';
import type { QtdDeTimes } from '@/domain/sorteio';
import { lerCadastro, MAX_CADASTROS_POR_MENSAGEM, TEXTO_COMO_CADASTRAR, type PessoaPedida } from '@/robo/cadastro-zap';
import { juntarNomes } from '@/robo/foto';
import type { EstadoDaSemana } from '@/server/presencas';

export type AcaoNaLista = 'adicionar' | 'confirmar' | 'remover';
export type Consulta = 'artilheiro' | 'garcom' | 'ranking' | 'times';
type Simples = 'lista' | 'falta' | 'fila' | 'ajuda' | 'sim' | 'anotar' | 'mandar' | Consulta;

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
  /** "importar" seguido dos times colados (as linhas ficam como vieram). */
  | { tipo: 'importar'; texto: string }
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
  mandar: 'mandar',
  'pode mandar': 'mandar',
  'mandar no grupo': 'mandar',
  'manda no grupo': 'mandar',
  'pode mandar no grupo': 'mandar',
  'mandar os times': 'mandar',
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
function comandoDeLista(texto: string): Extract<Comando, { tipo: AcaoNaLista | 'recusa' | 'cadastrar' }> | null {
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
  // "adicionar Caio - 2,5": nome com nota é cadastro de jogador novo (adicionar na lista não tem nota).
  if (tipo === 'adicionar' && /\s[-–]\s*\d/u.test(` ${nome}`)) {
    const pessoas = lerCadastro(nome);
    if (pessoas.some((p) => pareceFrase(p.nome))) return null;
    if (pessoas.length && pessoas.every((p) => p.nota !== null)) {
      return { tipo: 'cadastrar', pessoas: pessoas.slice(0, MAX_CADASTROS_POR_MENSAGEM), excedeu: pessoas.length > MAX_CADASTROS_POR_MENSAGEM };
    }
  }
  // Vírgulas e " e " separam nomes (só o "e"; "é" não separa). "Jonatha diarista" / "como diarista" /
  // "(D)": o jogador entra como diarista de qualquer jeito (só mensalista entra como M), então só o nome vale.
  const todos = nome
    .split(/\s*,\s*|\s+[eE]\s+/u)
    .map((n) => n.replace(/\s+(?:como\s+)?diarista$/iu, '').replace(/\s*\(\s*d\s*\)$/iu, '').trim())
    .filter(Boolean);
  if (todos.some(pareceFrase)) return null;
  if (todos.length > 1) {
    return { tipo, nome: todos[0], nomes: todos.slice(0, MAX_NOMES_POR_MENSAGEM), excedeu: todos.length > MAX_NOMES_POR_MENSAGEM };
  }
  if (todos.length === 0) return null;
  if (todos[0].length > TAM_MAX_NOME_PEDIDO) return { tipo: 'recusa', texto: TEXTO_NOME_COMPRIDO };
  return { tipo, nome: todos[0] };
}

const CADASTRAR = new Set(['cadastrar', 'cadastra', 'cadastre', 'cadastro']);

// Palavras que começam um pedido, não um nome ("e em seguida mande no grupo", "depois manda a lista").
const INICIO_DE_PEDIDO = new Set([
  'em', 'depois', 'entao', 'seguida', 'tambem', 'mande', 'manda', 'mandar', 'envie', 'envia', 'enviar', 'avise', 'avisa',
  'avisar', 'adicione', 'adiciona', 'adicionar', 'coloque', 'coloca', 'bota', 'bote', 'cadastre', 'cadastra',
  'cadastrar', 'remova', 'remove', 'tire', 'tira', 'mude', 'muda', 'troque', 'troca', 'sorteie', 'sorteia', 'me', 'pode',
  'por', 'favor', 'na', 'no', 'pra', 'para',
]);

/**
 * Nome que é, na verdade, o resto de um pedido em frase ("em seguida adicione na lista"): mais de 4
 * palavras, pontuação de frase ou aspas no meio, ou começa com palavra de pedido. Aí a mensagem toda vai
 * para a IA, que entende as várias tarefas, em vez de o comando fixo fazer só a primeira.
 */
function pareceFrase(nome: string): boolean {
  const palavras = nome.trim().split(/\s+/);
  if (palavras.length > 4) return true;
  if (/[.!?:"“”]/u.test(nome)) return true;
  return INICIO_DE_PEDIDO.has(normalizarNome(palavras[0] ?? ''));
}

/** "cadastrar Caio - 2,5 João - 3" (ou várias linhas) → pessoas; sem ninguém, o jeito de mandar. */
function comandoDeCadastro(texto: string): Extract<Comando, { tipo: 'cadastrar' | 'recusa' }> | null {
  const m = /^\s*(\S+)(?:\s+([\s\S]*))?$/u.exec(texto);
  if (!m || !CADASTRAR.has(normalizarNome(m[1]).replace(/[.,:;!?]+$/u, ''))) return null;
  const pessoas = lerCadastro(m[2] ?? '');
  if (!pessoas.length) return { tipo: 'recusa', texto: TEXTO_COMO_CADASTRAR };
  if (pessoas.some((p) => pareceFrase(p.nome))) return null;
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
  const importar = /^\s*importar(?:\s+(?:os\s+)?times)?\s*:?\s*([\s\S]*)$/iu.exec(textoSemMarcacao);
  if (importar) return { tipo: 'importar', texto: importar[1].trim() };
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
  '🙋 confirmar eu, remover eu — vale para você mesmo',
  '⚽ artilheiro · 🎯 garçom · 🏆 ranking — os primeiros do mês',
  '👕 times — os times de hoje, depois de confirmados',
  '',
  '🔐 Só os organizadores:',
  '🎲 sortear (ou sortear 3 times) — os times valem quando 2 dos 3 organizadores responderem sim',
  '🆕 cadastrar Nome - nota — jogador novo (ex.: Caio - 2,5, João - 3)',
  '📝 anotar — link para anotar as partidas de hoje, sem senha',
].join('\n');

/** O `ajuda` do privado (só organizadores chegam aqui): sem marcar, com tudo e por linguagem natural. */
export const TEXTO_AJUDA_PRIVADO = [
  '🤖 Fala! Aqui no privado não precisa me marcar. Comandos:',
  '',
  '🎲 sortear (ou sortear 3 times) — proposta de times',
  '📥 importar e os times colados embaixo — times feitos fora',
  '✅ sim — quem sorteou aprova primeiro; aí os outros recebem e mais um confirma com sim',
  '📣 mandar — quem propôs manda os times confirmados no grupo',
  '👕 times — a proposta esperando confirmação, ou os times confirmados',
  '📝 anotar — link para anotar as partidas de hoje, sem senha',
  '',
  '📋 notas — todos os jogadores com a nota',
  '✏️ nota Fulano 3,5 — muda a nota',
  '🆕 cadastrar Nome - nota — jogador novo (ex.: Caio - 2,5, João - 3)',
  '🌐 site — o link do site',
  '',
  '📋 lista · ⏳ falta confirmar · 📝 fila · ➕ adicionar · ✅ confirmar · 👋 remover · ⚽ artilheiro · 🎯 garçom · 🏆 ranking — como no grupo',
].join('\n');

/** Com a IA ligada, o `ajuda` do privado lembra que dá para falar normal. */
export const TEXTO_AJUDA_PRIVADO_IA = '💬 Ou fale normal, por exemplo: "muda a nota do Caio pra 3", "sorteia em 3 times", "pode confirmar os times".';

/** Com as perguntas livres ligadas, o `ajuda` lembra delas. */
export const TEXTO_AJUDA_PERGUNTA = '💬 Ou fale normal, por exemplo: @robô o João está na lista? (resenha também vale 😄)';
