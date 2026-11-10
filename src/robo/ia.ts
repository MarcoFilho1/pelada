import { dataDe } from '@/domain/tempo';
import type { Ferramenta } from './ferramentas';

const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_VOLTAS = 3;
const PRAZO_PADRAO_MS = 30_000;
export const ERRO_IA = 'Não consegui responder agora.';

type ChamadaDeFerramenta = { id: string; function: { name: string; arguments: string } };
type Mensagem =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ChamadaDeFerramenta[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type OpcoesIA = {
  chave: string;
  modelo: string;
  ferramentas: Ferramenta[];
  fetch?: typeof fetch;
  prazoMs?: number;
  agora?: () => Date;
};

function sistema(agora: Date): string {
  const [a, m, d] = dataDe(agora).split('-');
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Recife', hour: '2-digit', minute: '2-digit' }).format(agora);
  const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Recife', weekday: 'long' }).format(agora);
  return [
    'Você é o robô da pelada de quarta, num grupo de WhatsApp.',
    `Agora são ${hora} de ${dia}, ${d}/${m}/${a} (horário de Recife).`,
    'Responda em português, curto (poucas linhas), sem enfeite, como numa conversa de grupo.',
    'Responda só com o que as ferramentas mostram. Se não souber ou a ferramenta não trouxer, diga que não sabe. Nunca invente nomes, números ou datas.',
    'Se uma ferramenta trouxer ehHoje false, os times/partidas de hoje ainda não existem: diga isso e que os dados mostrados são da pelada de <data>, nunca apresente como de hoje.',
    'Você só consulta; não consegue alterar lista, times nem placar.',
  ].join('\n');
}

/** Um POST ao OpenRouter (formato OpenAI). Isolado aqui para ajustar o formato depois do teste ao vivo. */
async function chamarModelo(
  op: OpcoesIA,
  mensagens: Mensagem[],
  sinal: AbortSignal,
): Promise<{ content: string | null; tool_calls?: ChamadaDeFerramenta[] }> {
  const res = await (op.fetch ?? fetch)(URL_OPENROUTER, {
    method: 'POST',
    headers: { Authorization: `Bearer ${op.chave}`, 'Content-Type': 'application/json', 'X-Title': 'Pelada Robô' },
    body: JSON.stringify({
      model: op.modelo,
      messages: mensagens,
      tools: op.ferramentas.map((f) => ({ type: 'function', function: { name: f.nome, description: f.descricao, parameters: f.parametros } })),
      tool_choice: 'auto',
    }),
    signal: sinal,
  });
  if (!res.ok) throw new Error(`OpenRouter respondeu HTTP ${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string | null; tool_calls?: ChamadaDeFerramenta[] } }[] };
  const msg = json.choices?.[0]?.message;
  if (!msg) throw new Error('resposta sem mensagem');
  return { content: msg.content ?? null, tool_calls: msg.tool_calls };
}

async function conversar(pergunta: string, op: OpcoesIA, sinal: AbortSignal): Promise<string> {
  const mensagens: Mensagem[] = [
    { role: 'system', content: sistema((op.agora ?? (() => new Date()))()) },
    { role: 'user', content: pergunta },
  ];
  for (let volta = 0; volta <= MAX_VOLTAS; volta++) {
    const msg = await chamarModelo(op, mensagens, sinal);
    if (!msg.tool_calls?.length) {
      const texto = msg.content?.trim();
      if (!texto) throw new Error('resposta vazia');
      return texto;
    }
    if (volta === MAX_VOLTAS) throw new Error('voltas de ferramenta demais');
    mensagens.push({ role: 'assistant', content: msg.content, tool_calls: msg.tool_calls });
    for (const c of msg.tool_calls) {
      const ferramenta = op.ferramentas.find((f) => f.nome === c.function.name);
      if (!ferramenta) throw new Error(`ferramenta inexistente: ${c.function.name}`);
      const args: unknown = c.function.arguments?.trim() ? JSON.parse(c.function.arguments) : {};
      const resultado = await ferramenta.executar(args);
      mensagens.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(resultado ?? null) });
    }
  }
  throw new Error('voltas de ferramenta demais');
}

/** Pergunta livre à IA, só com ferramentas de leitura. Qualquer falha vira `ERRO_IA`. */
export async function perguntar(pergunta: string, op: OpcoesIA): Promise<string> {
  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), op.prazoMs ?? PRAZO_PADRAO_MS);
  try {
    // O prazo vale para a conversa toda, inclusive ferramenta que trava (ela não enxerga o sinal).
    const estourou = new Promise<never>((_, rej) => controle.signal.addEventListener('abort', () => rej(new Error('prazo estourado'))));
    const conversa = conversar(pergunta, op, controle.signal);
    conversa.catch(() => {});
    return await Promise.race([conversa, estourou]);
  } catch (e) {
    // Só a mensagem do erro (nunca a requisição, que leva a chave).
    console.error('[robo] pergunta livre falhou:', e instanceof Error ? e.message.replaceAll(op.chave, '***') : 'erro');
    return ERRO_IA;
  } finally {
    clearTimeout(prazo);
  }
}
