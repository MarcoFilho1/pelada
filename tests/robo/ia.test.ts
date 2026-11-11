import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { perguntar, type ClienteIA, type OpcoesIA } from '@/robo/ia';
import type { Ferramenta } from '@/robo/ferramentas';

const ERRO = '😕 Não consegui responder agora.';
type Pedido = Anthropic.MessageCreateParamsNonStreaming;

const uso = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
/** Uma resposta da Messages API (só os campos que o robô lê). */
function mensagem(content: unknown[], stop_reason: Anthropic.StopReason = 'end_turn'): Anthropic.Message {
  return { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content, stop_reason, stop_sequence: null, usage: uso } as unknown as Anthropic.Message;
}
const texto = (t: string) => mensagem([{ type: 'text', text: t, citations: null }]);
const chamada = (nome: string, input: unknown, id = 'tu_1') => mensagem([{ type: 'tool_use', id, name: nome, input }], 'tool_use');

/** Cliente falso: devolve as respostas na ordem (a última se repete) e guarda cada pedido. */
function falso(...respostas: (Anthropic.Message | (() => Promise<Anthropic.Message>))[]) {
  const pedidos: Pedido[] = [];
  let i = 0;
  const create = vi.fn(async (body: Pedido) => {
    // Cópia: o robô continua mexendo no array de mensagens depois da chamada.
    pedidos.push(structuredClone(body));
    const r = respostas[Math.min(i++, respostas.length - 1)];
    return typeof r === 'function' ? r() : r;
  });
  const cliente: ClienteIA = { messages: { create } };
  return { cliente, create, pedidos };
}

const ferramenta = (nome = 'lista_da_semana', executar: Ferramenta['executar'] = async () => ({ ok: 1 }), altera = false): Ferramenta => ({
  nome,
  descricao: 'd',
  parametros: { type: 'object', properties: {}, additionalProperties: false },
  executar,
  ...(altera ? { altera } : {}),
});
const base = (cliente: ClienteIA, ferramentas = [ferramenta()]): OpcoesIA => ({
  chave: 'sk-ant-segredo',
  ferramentas,
  cliente,
  agora: () => new Date('2026-11-10T15:00:00Z'),
  quem: 'Zeca',
});

describe('perguntar (Claude)', () => {
  it('resposta direta; modelo claude-haiku-5-5 e esforço baixo por padrão', async () => {
    const { cliente, pedidos } = falso(texto('Oi! ⚽'));
    expect(await perguntar('oi?', base(cliente))).toBe('Oi! ⚽');
    const p = pedidos[0];
    expect(p.model).toBe('claude-haiku-5-5');
    expect(p.output_config).toEqual({ effort: 'low' });
    expect(p.max_tokens).toBe(4000);
    expect(p.tool_choice).toEqual({ type: 'auto' });
    expect(p).not.toHaveProperty('thinking');
    expect(p.tools?.[0]).toMatchObject({ name: 'lista_da_semana', description: 'd', strict: true, input_schema: { type: 'object', additionalProperties: false } });
  });

  it('usa o modelo do ROBO_MODELO quando vem', async () => {
    const { cliente, pedidos } = falso(texto('ok'));
    await perguntar('x', { ...base(cliente), modelo: 'claude-sonnet-5-5' });
    expect(pedidos[0].model).toBe('claude-sonnet-5-5');
  });

  it('cache no prefixo estável: o system fica fixo e marcado; data, hora, quem e pergunta vão na mensagem do usuário', async () => {
    const um = falso(texto('a'));
    const dois = falso(texto('b'));
    await perguntar('primeira?', base(um.cliente));
    await perguntar('segunda?', { ...base(dois.cliente), agora: () => new Date('2026-11-11T22:00:00Z'), quem: 'Pepe' });
    const sistema = um.pedidos[0].system as Anthropic.TextBlockParam[];
    expect(sistema).toHaveLength(1);
    expect(sistema[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(sistema[0].text).toContain('Pelada 3.0');
    expect(sistema[0].text).not.toContain('2026');
    expect(dois.pedidos[0].system).toEqual(um.pedidos[0].system);
    expect(dois.pedidos[0].tools).toEqual(um.pedidos[0].tools);
    const usuario = JSON.stringify(um.pedidos[0].messages[0]);
    expect(um.pedidos[0].messages[0].role).toBe('user');
    expect(usuario).toContain('10/11/2026');
    expect(usuario).toContain('Zeca');
    expect(usuario).toContain('primeira?');
  });

  it('o prompt manda usar ferramentas, não inventar e nunca usar "careca"', async () => {
    const { cliente, pedidos } = falso(texto('a'));
    await perguntar('x', base(cliente));
    const s = (pedidos[0].system as Anthropic.TextBlockParam[])[0].text;
    expect(s).toMatch(/calvinho/i);
    expect(s).toMatch(/nunca use a palavra "careca"/i);
    expect(s).toMatch(/invente/);
    expect(s).toMatch(/telefone/);
  });

  it('o Jonas falando vai na mensagem do usuário', async () => {
    const { cliente, pedidos } = falso(texto('a'));
    await perguntar('x', { ...base(cliente), quem: 'Jonas', ehJonas: true });
    expect(JSON.stringify(pedidos[0].messages[0])).toMatch(/calvinho/);
  });

  it('uma volta de ferramenta: input como objeto, resultado como tool_result e conteúdo do assistente preservado', async () => {
    const executar = vi.fn(async () => ({ lista: ['Ana'] }));
    const pensamento = { type: 'thinking', thinking: '', signature: 'sig' };
    const pedido = mensagem([pensamento, { type: 'tool_use', id: 'tu_9', name: 'lista_da_semana', input: {} }], 'tool_use');
    const { cliente, pedidos } = falso(pedido, texto('Só a Ana.'));
    expect(await perguntar('quem vai?', base(cliente, [ferramenta('lista_da_semana', executar)]))).toBe('Só a Ana.');
    expect(executar).toHaveBeenCalledWith({});
    const msgs = pedidos[1].messages;
    expect(msgs[1]).toEqual({ role: 'assistant', content: pedido.content });
    expect(msgs[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_9', content: JSON.stringify({ lista: ['Ana'] }) }] });
  });

  it('ferramenta que devolve texto pronto: vai como está, sem aspas de JSON', async () => {
    const { cliente, pedidos } = falso(chamada('ver_fila', {}), texto('📝 Fila:\n1. Caio'));
    await perguntar('fila?', base(cliente, [ferramenta('ver_fila', async () => '📝 Fila:\n1. Caio')]));
    expect(pedidos[1].messages[2]).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '📝 Fila:\n1. Caio' }] });
  });

  it('recusa (stop_reason refusal): texto genérico, sem rodar a ferramenta da volta', async () => {
    const executar = vi.fn(async () => 'x');
    const recusa = mensagem([{ type: 'tool_use', id: 'tu_1', name: 'lista_da_semana', input: {} }], 'refusal');
    const { cliente } = falso(recusa);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await perguntar('x', base(cliente, [ferramenta('lista_da_semana', executar)]))).toBe(ERRO);
    expect(executar).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('max_tokens: texto genérico, sem rodar ferramenta cortada', async () => {
    const executar = vi.fn(async () => 'x');
    const cortada = mensagem([{ type: 'tool_use', id: 'tu_1', name: 'lista_da_semana', input: {} }], 'max_tokens');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await perguntar('x', base(falso(cortada).cliente, [ferramenta('lista_da_semana', executar)]))).toBe(ERRO);
    expect(await perguntar('x', base(falso(mensagem([{ type: 'text', text: 'meia resp' }], 'max_tokens')).cliente))).toBe(ERRO);
    expect(executar).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it.each([
    ['RateLimitError', () => new Anthropic.RateLimitError(429, { type: 'error' }, 'muitas', new Headers())],
    ['AuthenticationError', () => new Anthropic.AuthenticationError(401, { type: 'error' }, 'chave sk-ant-segredo inválida', new Headers())],
    ['InternalServerError', () => new Anthropic.InternalServerError(500, { type: 'error' }, 'boom', new Headers())],
    ['APIConnectionError', () => new Anthropic.APIConnectionError({ message: 'rede' })],
  ])('erro do SDK (%s): texto genérico e a chave nunca no log', async (_n, erro) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { cliente } = falso(() => Promise.reject(erro()));
    expect(await perguntar('x', base(cliente))).toBe(ERRO);
    expect(JSON.stringify(log.mock.calls)).not.toContain('sk-ant-segredo');
    log.mockRestore();
  });

  it('ferramenta inexistente, ferramenta que lança e resposta sem texto: texto genérico', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await perguntar('x', base(falso(chamada('apagar_tudo', {})).cliente))).toBe(ERRO);
    const quebra = ferramenta('lista_da_semana', async () => {
      throw new Error('boom');
    });
    expect(await perguntar('x', base(falso(chamada('lista_da_semana', {})).cliente, [quebra]))).toBe(ERRO);
    expect(await perguntar('x', base(falso(texto('   ')).cliente))).toBe(ERRO);
    expect(await perguntar('x', base(falso(mensagem([])).cliente))).toBe(ERRO);
    log.mockRestore();
  });

  it('prazo: modelo que nunca responde (o sinal chega ao SDK)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let sinal: AbortSignal | undefined;
    const create = vi.fn((_b: Pedido, op?: { signal?: AbortSignal }) => {
      sinal = op?.signal;
      return new Promise<Anthropic.Message>(() => {});
    });
    expect(await perguntar('x', { ...base({ messages: { create } }), prazoMs: 20 })).toBe(ERRO);
    expect(sinal?.aborted).toBe(true);
    log.mockRestore();
  });

  it('prazo cobre ferramenta que nunca resolve', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const trava = ferramenta('lista_da_semana', () => new Promise(() => {}));
    expect(await perguntar('x', { ...base(falso(chamada('lista_da_semana', {})).cliente, [trava]), prazoMs: 20 })).toBe(ERRO);
    log.mockRestore();
  });

  it('mais de 3 voltas de ferramenta: para na quarta chamada', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { cliente, create } = falso(chamada('lista_da_semana', {}));
    expect(await perguntar('x', base(cliente))).toBe(ERRO);
    expect(create).toHaveBeenCalledTimes(4);
    log.mockRestore();
  });

  it('mais de 6 ferramentas numa volta: texto genérico, sem executar nenhuma', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const usos = Array.from({ length: 7 }, (_, i) => ({ type: 'tool_use', id: `tu_${i}`, name: 'lista_da_semana', input: {} }));
    const executar = vi.fn(async () => ({}));
    expect(await perguntar('x', base(falso(mensagem(usos, 'tool_use')).cliente, [ferramenta('lista_da_semana', executar)]))).toBe(ERRO);
    expect(executar).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('corta resposta longa (1000) e pergunta longa (500)', async () => {
    const { cliente, pedidos } = falso(texto('a'.repeat(1500)));
    const r = await perguntar('p'.repeat(800), base(cliente));
    expect(r.length).toBeLessThanOrEqual(1000);
    expect(r.endsWith('…')).toBe(true);
    const usuario = JSON.stringify(pedidos[0].messages[0]);
    expect(usuario).toContain('p'.repeat(500));
    expect(usuario).not.toContain('p'.repeat(501));
  });

  it('ação já feita e depois falha: o grupo recebe o texto da ação, não o erro genérico', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const adicionar = ferramenta('adicionar_jogador', async () => '✅ Pepe entrou na lista! (pedido por Zeca)', true);
    const { cliente } = falso(chamada('adicionar_jogador', { nome: 'Pepe' }), () => Promise.reject(new Anthropic.InternalServerError(500, undefined, 'x', new Headers())));
    expect(await perguntar('põe o Pepe', base(cliente, [adicionar]))).toBe('✅ Pepe entrou na lista! (pedido por Zeca)');
    log.mockRestore();
  });
});
