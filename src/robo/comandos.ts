import { normalizarNome } from '@/domain/nome';
import { juntarNomes } from '@/robo/foto';
import type { EstadoDaSemana } from '@/server/presencas';

export type Comando =
  | { tipo: 'lista' | 'falta' | 'fila' | 'ajuda' | 'sortear' | 'sim' }
  | { tipo: 'pergunta'; texto: string };

const PALAVRAS: Record<string, 'lista' | 'falta' | 'fila' | 'ajuda' | 'sortear' | 'sim'> = {
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
  sim: 'sim',
};

/** Texto da mensagem sem a marcação → comando. Sobra de texto depois do comando é pergunta livre. */
export function interpretar(textoSemMarcacao: string): Comando {
  const limpo = normalizarNome(textoSemMarcacao).replace(/[\s.,;:!?]+$/u, '').trim();
  if (limpo === '') return { tipo: 'lista' };
  const tipo = PALAVRAS[limpo];
  if (tipo) return { tipo };
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
  '- sortear: admins propõem o sorteio dos times',
  'Ou faça uma pergunta, por exemplo: @robô o João está na lista?',
].join('\n');

export function respostaListaSemMudanca(hora: string): string {
  return `A lista não mudou desde as ${hora}.`;
}
