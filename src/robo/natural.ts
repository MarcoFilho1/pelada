// Os avisos que o robô manda por conta própria (a um organizador ou no grupo) saem de textos fixos.
// Aqui a IA reescreve o aviso do jeito que alguém do grupo escreveria, sem mudar nenhum fato: os
// nomes, números, a chave do Pix e os comandos entre asteriscos têm de continuar iguais. O que a IA
// devolve é conferido; se faltar um desses trechos, aparecer número novo ou a IA falhar, vai o
// texto fixo. Listas, times, ranking e resumo não passam por aqui: saem palavra por palavra.
import type { ClienteIA, UsoDaIA } from './ia';

export type OpcoesDoNatural = {
  cliente: ClienteIA;
  modelo: string;
  /** Para quem vai: muda o tratamento (um amigo organizador, ou a galera do grupo). */
  para: 'grupo' | 'organizador';
  /** Trechos que têm de aparecer iguais (nomes de gente, por exemplo). Números, comandos e chaves entram sozinhos. */
  fixos?: string[];
  /** As linhas do caderno da resenha: o jeito de falar do grupo. */
  caderno?: string[];
  aoUsar?: (u: UsoDaIA) => void;
  prazoMs?: number;
};

const PRAZO_MS = 8_000;

const SISTEMA = [
  'Você é o robô do grupo de WhatsApp de uma pelada (futebol entre amigos, toda quarta). Seu jeito: boleiro de resenha, amigo do pessoal, escrevendo como o grupo escreve no WhatsApp.',
  'Sua tarefa: reescrever o aviso que vem na mensagem para ele soar natural, como um amigo avisando, e não como um sistema.',
  'Regras: não invente nem tire nenhum fato. Nomes de pessoas, números, valores, porcentagens, a chave do Pix e as palavras entre asteriscos (são comandos, mantenha os asteriscos) continuam exatamente como estão.',
  'Jeito de escrever: curto, no máximo o tamanho do aviso original; "pra", "tá", "tô" valem; no máximo uma gíria, sem forçar; no máximo um emoji (pode ser o do aviso, ou nenhum); sem ponto final no fim e sem exclamação.',
  'Vá direto ao assunto: sem saudação ("fala", "bora", "e aí", "pessoal", "mano"), sem chamar ninguém de nada, sem assinatura. Escreva os números com algarismos, como no aviso.',
  'Pode quebrar em até 3 linhas curtas. Responda só com o aviso reescrito, sem aspas e sem explicação.',
].join('\n');

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Os trechos que não podem mudar, tirados do próprio aviso: comandos entre asteriscos, números e chaves com @. */
export function trechosFixos(texto: string): string[] {
  const comandos = texto.match(/\*[^*\n]+\*/g) ?? [];
  const numeros = texto.match(/\d+(?:[.,:/]\d+)*%?/g) ?? [];
  const chaves = texto.match(/\S+@\S+/g) ?? [];
  return [...new Set([...comandos, ...numeros, ...chaves.map((c) => c.replace(/[.,;!?]+$/, ''))])];
}

/** O texto da IA serve? Todos os trechos fixos presentes, nenhum número novo, tamanho parecido. */
export function serve(original: string, novo: string, fixos: string[]): boolean {
  const n = novo.trim();
  if (!n || n.length > original.length * 1.6 + 40 || n.length < original.length * 0.3) return false;
  const base = semAcento(n);
  for (const f of [...trechosFixos(original), ...fixos]) if (f.trim() && !base.includes(semAcento(f.trim()))) return false;
  // Número que não estava no aviso: a IA inventou (um valor, uma hora, um placar).
  const antes = new Set(original.match(/\d+/g) ?? []);
  if ((n.match(/\d+/g) ?? []).some((d) => !antes.has(d))) return false;
  // Mesma quantidade de comandos: nem a mais (comando inventado) nem a menos.
  return (n.match(/\*[^*\n]+\*/g) ?? []).length === (original.match(/\*[^*\n]+\*/g) ?? []).length;
}

/** Tira aspas e cercas que a IA às vezes põe em volta. */
export function limpar(texto: string): string {
  return texto.trim().replace(/^```\w*\n?|```$/g, '').trim().replace(/^["“”']+|["“”']+$/g, '').trim();
}

/** O aviso reescrito, ou o próprio `texto` quando a IA falha, demora ou devolve algo que não serve. */
export async function naturalizar(texto: string, op: OpcoesDoNatural): Promise<string> {
  try {
    const pedido = [
      op.para === 'grupo' ? 'Este aviso vai para o grupo da pelada.' : 'Este aviso vai no privado de um organizador da pelada (um amigo).',
      ...(op.caderno?.length ? ['Do jeito do grupo (só para pegar o tom, não cite):', ...op.caderno.slice(0, 12).map((l) => `- ${l}`)] : []),
      'Aviso:',
      texto,
    ].join('\n');
    const chamada = op.cliente.messages.create({
      model: op.modelo,
      // Folga para o raciocínio do modelo: com pouco, a resposta vinha vazia.
      max_tokens: 800,
      output_config: { effort: 'low' },
      system: SISTEMA,
      messages: [{ role: 'user', content: pedido }],
    });
    const prazo = new Promise<null>((r) => setTimeout(() => r(null), op.prazoMs ?? PRAZO_MS));
    const r = await Promise.race([chamada, prazo]);
    if (!r) return texto;
    const u = r.usage;
    if (u) op.aoUsar?.({ entrada: u.input_tokens ?? 0, cacheLido: u.cache_read_input_tokens ?? 0, cacheGravado: u.cache_creation_input_tokens ?? 0, saida: u.output_tokens ?? 0 });
    const novo = limpar(r.content.map((b) => (b.type === 'text' ? b.text : '')).join(''));
    return serve(texto, novo, op.fixos ?? []) ? novo : texto;
  } catch {
    return texto;
  }
}

/** Teto de avisos reescritos por dia (custo): passou, vai o texto fixo. */
export const MAX_NATURAIS_POR_DIA = 40;
