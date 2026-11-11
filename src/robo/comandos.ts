import { normalizarNome } from '@/domain/nome';
import { juntarNomes } from '@/robo/foto';
import type { EstadoDaSemana } from '@/server/presencas';

export type AcaoNaLista = 'adicionar' | 'confirmar' | 'remover';
export type Consulta = 'artilheiro' | 'garcom' | 'ranking' | 'times';
type Simples = 'lista' | 'falta' | 'fila' | 'ajuda' | 'sortear' | 'sim' | Consulta;

export type Comando =
  | { tipo: Simples }
  | { tipo: AcaoNaLista; nome: string }
  /** Vários nomes numa só mensagem: até `MAX_NOMES_POR_MENSAGEM` em `nomes`; `excedeu` se havia mais. */
  | { tipo: AcaoNaLista; nome: string; nomes: string[]; excedeu: boolean }
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
  sortear: 'sortear',
  sorteia: 'sortear',
  sorteio: 'sortear',
  // As mensagens de erro do sorteio pedem "Peça *sortear* de novo".
  'sortear de novo': 'sortear',
  'sorteia de novo': 'sortear',
  'sortear novamente': 'sortear',
  sim: 'sim',
  artilheiro: 'artilheiro',
  artilheiros: 'artilheiro',
  artilharia: 'artilheiro',
  garcom: 'garcom',
  garcons: 'garcom',
  ranking: 'ranking',
  times: 'times',
};

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

/** Texto da mensagem sem a marcação → comando. Sobra de texto depois do comando é pergunta livre. */
export function interpretar(textoSemMarcacao: string): Comando {
  const limpo = normalizarNome(textoSemMarcacao).replace(/[\s.,;:!?]+$/u, '').trim();
  if (limpo === '') return { tipo: 'lista' };
  const tipo = PALAVRAS[limpo];
  if (tipo) return { tipo };
  const deLista = comandoDeLista(textoSemMarcacao);
  if (deLista) return deLista;
  return { tipo: 'pergunta', texto: textoSemMarcacao.trim().replace(/\s+/g, ' ') };
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
  '🎲 sortear — só os organizadores',
].join('\n');

/** Com as perguntas livres ligadas, o `ajuda` lembra delas. */
export const TEXTO_AJUDA_PERGUNTA = '💬 Ou faça uma pergunta, por exemplo: @robô o João está na lista?';
