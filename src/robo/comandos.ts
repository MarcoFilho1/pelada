import { normalizarNome } from '@/domain/nome';
import { juntarNomes } from '@/robo/foto';
import type { EstadoDaSemana } from '@/server/presencas';

export type AcaoNaLista = 'adicionar' | 'confirmar' | 'remover';
export type Consulta = 'artilheiro' | 'garcom' | 'ranking' | 'times';
type Simples = 'lista' | 'falta' | 'fila' | 'ajuda' | 'sortear' | 'sim' | Consulta;

export type Comando =
  | { tipo: Simples }
  | { tipo: AcaoNaLista; nome: string }
  | { tipo: 'pergunta'; texto: string };

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
function comandoDeLista(texto: string): { tipo: AcaoNaLista; nome: string } | null {
  const palavras = texto.trim().split(/\s+/);
  const tipo = ACOES[normalizarNome(palavras[0] ?? '')];
  if (!tipo) return null;
  let resto = palavras.slice(1);
  if (tipo === 'adicionar') {
    if (normalizarNome(resto[0] ?? '') === 'na' && normalizarNome(resto[1] ?? '') === 'lista') resto = resto.slice(2);
    else if (normalizarNome(resto[0] ?? '') === 'lista') resto = resto.slice(1);
  }
  const nome = resto.join(' ').replace(/[\s.,;:!?]+$/u, '').trim();
  return nome ? { tipo, nome } : null;
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
  if (!pendentes.length) return 'Todo mundo da lista já confirmou.';
  return `Ainda não confirmaram: ${juntarNomes(pendentes)}.`;
}

export function respostaFila(estado: EstadoDaSemana): string {
  if (!estado.fila.length) return 'Ninguém na fila.';
  return `Fila:\n${estado.fila.map((i, n) => `${n + 1}. ${i.nome}`).join('\n')}`;
}

export const TEXTO_AJUDA = [
  'Me marque com um comando:',
  '- lista: a lista da semana',
  '- falta confirmar: quem ainda não confirmou',
  '- fila: quem está na fila',
  '- adicionar Nome: põe o jogador na lista (ou na fila, se estiver cheia)',
  '- confirmar Nome: confirma quem está na lista',
  '- remover Nome: tira da lista ou da fila',
  '- artilheiro, garçom, ranking: os primeiros do mês',
  '- times: os times de hoje',
  '- sortear: só os organizadores',
].join('\n');

/** Com as perguntas livres ligadas, o `ajuda` lembra delas. */
export const TEXTO_AJUDA_PERGUNTA = 'Ou faça uma pergunta, por exemplo: @robô o João está na lista?';

export function respostaListaSemMudanca(hora: string): string {
  return `A lista não mudou desde as ${hora}.`;
}
