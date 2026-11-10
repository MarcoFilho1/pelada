import { describe, expect, it, vi } from 'vitest';
import { perguntar } from '@/robo/ia';
import type { Ferramenta } from '@/robo/ferramentas';

const ERRO = 'Não consegui responder agora.';
const resp = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
const texto = (content: string) => resp({ choices: [{ message: { role: 'assistant', content } }] });
const chamada = (nome: string, args: string, id = 'c1') =>
  resp({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: args } }] } }] });

const ferramenta = (executar: Ferramenta['executar'] = async () => ({ ok: 1 })): Ferramenta => ({
  nome: 'lista_da_semana',
  descricao: 'd',
  parametros: { type: 'object', properties: {} },
  executar,
});
const base = (f: typeof fetch, ferramentas = [ferramenta()]) => ({ chave: 'sk-segredo', modelo: 'm/x', ferramentas, fetch: f, agora: () => new Date('2026-11-10T15:00:00Z') });

describe('perguntar', () => {
  it('resposta direta, com o formato OpenRouter', async () => {
    const f = vi.fn(async () => texto('Oi!'));
    expect(await perguntar('oi?', base(f as unknown as typeof fetch))).toBe('Oi!');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-segredo');
    const corpo = JSON.parse(init.body as string);
    expect(corpo.model).toBe('m/x');
    expect(corpo.tool_choice).toBe('auto');
    expect(corpo.tools[0]).toMatchObject({ type: 'function', function: { name: 'lista_da_semana' } });
    expect(corpo.messages[0].role).toBe('system');
    expect(corpo.messages[0].content).toContain('10/11/2026');
    expect(corpo.messages[1]).toEqual({ role: 'user', content: 'oi?' });
  });

  it('uma volta de ferramenta', async () => {
    const executar = vi.fn(async () => ({ lista: ['Ana'] }));
    const f = vi.fn().mockResolvedValueOnce(chamada('lista_da_semana', '{}')).mockResolvedValueOnce(texto('Só a Ana.'));
    expect(await perguntar('quem vai?', base(f as unknown as typeof fetch, [ferramenta(executar)]))).toBe('Só a Ana.');
    expect(executar).toHaveBeenCalledWith({});
    const corpo2 = JSON.parse((f.mock.calls[1][1] as RequestInit).body as string);
    const ultima = corpo2.messages.at(-1);
    expect(ultima).toEqual({ role: 'tool', tool_call_id: 'c1', content: JSON.stringify({ lista: ['Ana'] }) });
  });

  it('ferramenta inexistente', async () => {
    const f = vi.fn(async () => chamada('apagar_tudo', '{}'));
    expect(await perguntar('x', base(f as unknown as typeof fetch))).toBe(ERRO);
  });

  it('argumentos com JSON inválido', async () => {
    const f = vi.fn(async () => chamada('lista_da_semana', '{quebrado'));
    expect(await perguntar('x', base(f as unknown as typeof fetch))).toBe(ERRO);
  });

  it('ferramenta que lança', async () => {
    const f = vi.fn(async () => chamada('lista_da_semana', '{}'));
    const quebra = ferramenta(async () => {
      throw new Error('boom');
    });
    expect(await perguntar('x', base(f as unknown as typeof fetch, [quebra]))).toBe(ERRO);
  });

  it.each([429, 500])('HTTP %i', async (status) => {
    const f = vi.fn(async () => resp({ error: 'x' }, status));
    expect(await perguntar('x', base(f as unknown as typeof fetch))).toBe(ERRO);
  });

  it('rede que falha e resposta sem texto', async () => {
    expect(await perguntar('x', base((async () => Promise.reject(new Error('rede'))) as unknown as typeof fetch))).toBe(ERRO);
    expect(await perguntar('x', base((async () => resp({ choices: [] })) as unknown as typeof fetch))).toBe(ERRO);
    expect(await perguntar('x', base((async () => texto('   ')) as unknown as typeof fetch))).toBe(ERRO);
  });

  it('timeout', async () => {
    const f = vi.fn((_u: unknown, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(new Error('abortado')))));
    expect(await perguntar('x', { ...base(f as unknown as typeof fetch), prazoMs: 20 })).toBe(ERRO);
  });

  it('timeout cobre ferramenta que nunca resolve', async () => {
    const f = vi.fn(async () => chamada('lista_da_semana', '{}'));
    const trava = ferramenta(() => new Promise(() => {}));
    expect(await perguntar('x', { ...base(f as unknown as typeof fetch, [trava]), prazoMs: 20 })).toBe(ERRO);
  });

  it('mais de 3 voltas de ferramenta para', async () => {
    const f = vi.fn(async () => chamada('lista_da_semana', '{}'));
    expect(await perguntar('x', base(f as unknown as typeof fetch))).toBe(ERRO);
    expect(f).toHaveBeenCalledTimes(4);
  });

  it('limita a resposta do modelo (max_tokens), corta resposta longa e pergunta longa', async () => {
    const f = vi.fn(async () => texto('a'.repeat(1500)));
    const r = await perguntar('p'.repeat(800), base(f as unknown as typeof fetch));
    expect(r.length).toBeLessThanOrEqual(1000);
    expect(r.endsWith('…')).toBe(true);
    const corpo = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(corpo.max_tokens).toBe(400);
    expect(corpo.messages[1].content.length).toBe(500);
  });

  it('mais de 6 ferramentas numa volta: erro curto, sem executar nenhuma', async () => {
    const calls = Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, type: 'function', function: { name: 'lista_da_semana', arguments: '{}' } }));
    const f = vi.fn(async () => resp({ choices: [{ message: { role: 'assistant', content: null, tool_calls: calls } }] }));
    const executar = vi.fn(async () => ({}));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await perguntar('x', base(f as unknown as typeof fetch, [ferramenta(executar)]))).toBe(ERRO);
    expect(executar).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('não vaza a chave no erro nem no log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = vi.fn(async () => resp({ error: 'sk-segredo' }, 500));
    const r = await perguntar('x', base(f as unknown as typeof fetch));
    expect(r).not.toContain('sk-segredo');
    expect(JSON.stringify(log.mock.calls)).not.toContain('sk-segredo');
    log.mockRestore();
  });
});
