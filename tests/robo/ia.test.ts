import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';
import { ERRO_IA, MAX_FERRAMENTAS_ESTRITAS, paraTools, perguntar, perguntarEmPartes, SISTEMA, TEXTO_IA_FORA, type ClienteIA, type OpcoesIA } from '@/robo/ia';
import { ErroDeFerramenta, TextoPronto, type Ferramenta } from '@/robo/ferramentas';

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

const ferramenta = (nome = 'lista_da_semana', executar: Ferramenta['executar'] = async () => ({ ok: 1 }), extra: Partial<Ferramenta> = {}): Ferramenta => ({
  nome,
  descricao: 'd',
  parametros: { type: 'object', properties: {}, additionalProperties: false },
  executar,
  ...extra,
});
/** Os tool_result da mensagem de usuário de índice `i` no pedido `n`. */
const resultadosDe = (p: Pedido, i: number) => p.messages[i].content as Anthropic.ToolResultBlockParam[];
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
    expect(p.tools?.[0]).toMatchObject({ name: 'lista_da_semana', description: 'd', input_schema: { type: 'object', additionalProperties: false } });
    // Sem argumentos: não vai como strict (a Anthropic aceita só 20 strict por pedido).
    expect(p.tools?.[0]).not.toHaveProperty('strict');
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

  it('no privado, a mensagem do usuário diz que é privado com organizador', async () => {
    const { cliente, pedidos } = falso(texto('a'));
    await perguntar('notas?', { ...base(cliente), privado: true });
    expect(JSON.stringify(pedidos[0].messages[0])).toContain('Conversa: privado com um organizador.');
    const { cliente: c2, pedidos: p2 } = falso(texto('a'));
    await perguntar('notas?', base(c2));
    expect(JSON.stringify(p2[0].messages[0])).not.toContain('Conversa: privado');
  });

  it('o nome de quem fala no site (apelido) vai na mensagem do usuário', async () => {
    const { cliente, pedidos } = falso(texto('a'));
    await perguntar('eu vou', { ...base(cliente), quem: 'Marco Filho', jogador: 'Marquinho' });
    expect(JSON.stringify(pedidos[0].messages[0])).toContain('Quem está falando: Marco Filho, que no site é o jogador Marquinho.');
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
    ['InternalServerError', () => new Anthropic.InternalServerError(500, { type: 'error' }, 'boom', new Headers())],
    ['APIConnectionError', () => new Anthropic.APIConnectionError({ message: 'rede' })],
  ])('erro do SDK (%s): texto genérico e a chave nunca no log', async (_n, erro) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { cliente } = falso(() => Promise.reject(erro()));
    expect(await perguntar('x', base(cliente))).toBe(ERRO);
    expect(JSON.stringify(log.mock.calls)).not.toContain('sk-ant-segredo');
    log.mockRestore();
  });

  it.each([
    ['chave recusada', () => new Anthropic.AuthenticationError(401, { type: 'error' }, 'chave sk-ant-segredo inválida', new Headers()), 'chave da Anthropic recusada (401)'],
    ['sem crédito', () => new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }, undefined, new Headers()), 'sem crédito na Anthropic'],
    ['limite de gasto', () => new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'You have reached your specified API usage limits.' } }, undefined, new Headers()), 'limite de gasto da Anthropic'],
  ])('IA parada (%s): avisa que a conversa está de folga, chama aoParar sem a chave', async (_n, erro, motivoEsperado) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const aoParar = vi.fn();
    const { cliente } = falso(() => Promise.reject(erro()));
    expect(await perguntar('x', { ...base(cliente), aoParar })).toBe(TEXTO_IA_FORA);
    expect(aoParar).toHaveBeenCalledWith(motivoEsperado);
    expect(JSON.stringify([log.mock.calls, aoParar.mock.calls])).not.toContain('sk-ant-segredo');
    log.mockRestore();
  });

  it('aoUsar recebe os tokens de todas as voltas somados', async () => {
    const comUso = (m: Anthropic.Message, u: Partial<Anthropic.Usage>) => ({ ...m, usage: { ...m.usage, ...u } }) as Anthropic.Message;
    const aoUsar = vi.fn();
    const { cliente } = falso(
      comUso(chamada('lista_da_semana', {}), { input_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 0, output_tokens: 40 }),
      comUso(texto('ok'), { input_tokens: 150, cache_read_input_tokens: 2000, cache_creation_input_tokens: 10, output_tokens: 20 }),
    );
    await perguntar('x', { ...base(cliente), aoUsar });
    expect(aoUsar).toHaveBeenCalledWith({ entrada: 250, cacheLido: 4000, cacheGravado: 10, saida: 60 });
  });

  it('resposta sem texto: texto genérico', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await perguntar('x', base(falso(texto('   ')).cliente))).toBe(ERRO);
    expect(await perguntar('x', base(falso(mensagem([])).cliente))).toBe(ERRO);
    log.mockRestore();
  });

  it('falha de ferramenta vira tool_result com is_error e a conversa segue', async () => {
    const recusa = ferramenta('remover_jogador', async () => {
      throw new ErroDeFerramenta('🤔 Zé não está na lista.');
    });
    const quebra = ferramenta('lista_da_semana', async () => {
      throw new Error('conexão com o banco sk-ant-segredo caiu');
    });
    const usos = mensagem(
      [
        { type: 'tool_use', id: 'a', name: 'apagar_tudo', input: {} },
        { type: 'tool_use', id: 'b', name: 'remover_jogador', input: { nome: 'Zé' } },
        { type: 'tool_use', id: 'c', name: 'lista_da_semana', input: {} },
      ],
      'tool_use',
    );
    const { cliente, pedidos } = falso(usos, texto('O Zé não está na lista 🤔'));
    expect(await perguntar('tira o Zé', base(cliente, [recusa, quebra]))).toBe('O Zé não está na lista 🤔');
    expect(resultadosDe(pedidos[1], 2)).toEqual([
      { type: 'tool_result', tool_use_id: 'a', is_error: true, content: 'Ferramenta inexistente: apagar_tudo.' },
      { type: 'tool_result', tool_use_id: 'b', is_error: true, content: '🤔 Zé não está na lista.' },
      { type: 'tool_result', tool_use_id: 'c', is_error: true, content: 'Não deu para consultar agora.' },
    ]);
    expect(JSON.stringify(pedidos)).not.toContain('sk-ant-segredo');
  });

  it('duas ferramentas no mesmo turno: uma mensagem de usuário com os dois tool_result, na ordem e com os ids', async () => {
    const usos = mensagem(
      [
        { type: 'tool_use', id: 'tu_a', name: 'ver_fila', input: {} },
        { type: 'tool_use', id: 'tu_b', name: 'lista_da_semana', input: {} },
      ],
      'tool_use',
    );
    const { cliente, pedidos } = falso(usos, texto('ok'));
    await perguntar('x', base(cliente, [ferramenta('ver_fila', async () => 'fila'), ferramenta('lista_da_semana', async () => ({ n: 1 }))]));
    expect(pedidos[1].messages).toHaveLength(3);
    expect(pedidos[1].messages[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tu_a', content: 'fila' },
        { type: 'tool_result', tool_use_id: 'tu_b', content: JSON.stringify({ n: 1 }) },
      ],
    });
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

  const acao = (executar = vi.fn(async (args: unknown) => new TextoPronto(`👋 ${(args as { nome: string }).nome} saiu da lista. (pedido por Zeca)`, 'acao'))) =>
    ferramenta('remover_jogador', executar, { altera: true });

  it('ação já feita e depois falha: o grupo recebe o texto da ação, não o erro genérico', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { cliente } = falso(chamada('remover_jogador', { nome: 'Pepe' }), () => Promise.reject(new Anthropic.InternalServerError(500, undefined, 'x', new Headers())));
    expect(await perguntar('tira o Pepe', base(cliente, [acao()]))).toBe('👋 Pepe saiu da lista. (pedido por Zeca)');
    log.mockRestore();
  });

  it('no máximo 3 mudanças na lista por conversa: 5 remoções pedidas → 3 escritas, 2 is_error', async () => {
    const executar = vi.fn(async (args: unknown) => new TextoPronto(`👋 ${(args as { nome: string }).nome} saiu da lista. (pedido por Zeca)`, 'acao'));
    const usos = mensagem(['A', 'B', 'C', 'D', 'E'].map((n, i) => ({ type: 'tool_use', id: `r${i}`, name: 'remover_jogador', input: { nome: n } })), 'tool_use');
    const { cliente, pedidos } = falso(usos, chamada('remover_jogador', { nome: 'F' }, 'r9'), texto('Feito!'));
    const r = await perguntar('tira todo mundo', base(cliente, [acao(executar)]));
    expect(executar).toHaveBeenCalledTimes(3);
    const res = resultadosDe(pedidos[1], 2);
    expect(res.slice(3)).toEqual([
      { type: 'tool_result', tool_use_id: 'r3', is_error: true, content: '⚠️ Só mudo até 3 nomes por mensagem. Mande o resto em outra.' },
      { type: 'tool_result', tool_use_id: 'r4', is_error: true, content: '⚠️ Só mudo até 3 nomes por mensagem. Mande o resto em outra.' },
    ]);
    expect(resultadosDe(pedidos[2], 4)).toEqual([{ type: 'tool_result', tool_use_id: 'r9', is_error: true, content: '⚠️ Só mudo até 3 nomes por mensagem. Mande o resto em outra.' }]);
    expect(r).toBe('Feito!\n\n👋 A saiu da lista. (pedido por Zeca)\n\n👋 B saiu da lista. (pedido por Zeca)\n\n👋 C saiu da lista. (pedido por Zeca)');
  });

  it('toda mudança na lista sai palavra por palavra: só acrescenta as que a resposta não traz', async () => {
    const usos = mensagem(
      [
        { type: 'tool_use', id: 'a', name: 'remover_jogador', input: { nome: 'Ana' } },
        { type: 'tool_use', id: 'b', name: 'remover_jogador', input: { nome: 'Bia' } },
      ],
      'tool_use',
    );
    const { cliente } = falso(usos, texto('Pronto! 👋 Ana saiu da lista. (pedido por Zeca) e a Bia também saiu.'));
    expect(await perguntar('tira Ana e Bia', base(cliente, [acao()]))).toBe(
      'Pronto! 👋 Ana saiu da lista. (pedido por Zeca) e a Bia também saiu.\n\n👋 Bia saiu da lista. (pedido por Zeca)',
    );
  });

  it('a lista (ver_lista) nunca é cortada: o teto de 1000 vale só para o texto do modelo', async () => {
    const nomes = Array.from({ length: 16 }, (_, i) => `${i + 1}. Jogador Número ${i + 1} (M) ✅`);
    const fila = Array.from({ length: 6 }, (_, i) => `${i + 1}. Diarista Número ${i + 1}`);
    const listaTexto = `Pelada 11/11 - 20:30-22:30\n\n${nomes.join('\n')}\n\nFila:\n${fila.join('\n')}`;
    const verLista = ferramenta('ver_lista', async () => new TextoPronto(listaTexto, 'lista'));
    // O modelo repete a lista e ainda fala demais: a lista inteira sai, o resto é cortado.
    const prosa = `Aqui a lista ⚽\n${listaTexto}\n${'bla '.repeat(400)}`;
    const um = await perguntar('lista?', base(falso(chamada('ver_lista', {}), texto(prosa)).cliente, [verLista]));
    expect(um).toContain(listaTexto);
    expect(um.startsWith('Aqui a lista ⚽')).toBe(true);
    expect(um.replace(listaTexto, '').length).toBeLessThanOrEqual(1000 + 4);
    // O modelo esquece a lista: ela vai inteira depois da frase dele.
    const dois = await perguntar('lista?', base(falso(chamada('ver_lista', {}), texto('Segue a lista!')).cliente, [verLista]));
    expect(dois).toBe(`Segue a lista!\n\n${listaTexto}`);
    expect(listaTexto.length).toBeGreaterThan(500);
  });

  describe('sorteio pela IA', () => {
    const PROPOSTA = '🎲 Times sorteados:\n\n🔵 Azul (7,0)\n- Ana 7,0\n\nConfirma? Responda *sim* em até 10 minutos ✅';
    const sorteio = (executar = vi.fn(async () => new TextoPronto(PROPOSTA, 'sorteio'))) => ferramenta('pedir_sorteio', executar, { sorteio: true });

    it('o texto da proposta sai exatamente como foi guardado; do modelo só uma linha curta antes', async () => {
      const reescrita = `Bora! 🎲\nTimes: Azul com Ana e Bia (inventado)\n${'x'.repeat(300)}`;
      const r = await perguntar('sorteia', base(falso(chamada('pedir_sorteio', {}), texto(reescrita)).cliente, [sorteio()]));
      expect(r).toBe(`Bora! 🎲\n\n${PROPOSTA}`);
      const semTexto = await perguntar('sorteia', base(falso(chamada('pedir_sorteio', {}), mensagem([{ type: 'text', text: PROPOSTA }])).cliente, [sorteio()]));
      expect(semTexto).toBe(PROPOSTA);
    });

    it('a IA pede 3 times: o `times` chega à ferramenta e o schema vai estrito para a API', async () => {
      const executar = vi.fn(async () => new TextoPronto(PROPOSTA, 'sorteio'));
      const comTimes = {
        ...sorteio(executar),
        parametros: { type: 'object' as const, properties: { times: { type: 'integer' as const, enum: [3, 4] } }, additionalProperties: false as const },
      };
      const { cliente, pedidos } = falso(chamada('pedir_sorteio', { times: 3 }), texto('Bora!'));
      await perguntar('sorteia em 3 times', base(cliente, [comTimes]));
      expect(executar).toHaveBeenCalledWith({ times: 3 });
      expect(pedidos[0].tools?.[0]).toMatchObject({ name: 'pedir_sorteio', strict: true, input_schema: comTimes.parametros });
    });

    it('um sorteio só por conversa: a segunda chamada é is_error, sem sortear de novo', async () => {
      const executar = vi.fn(async () => new TextoPronto(PROPOSTA, 'sorteio'));
      const usos = mensagem(
        [
          { type: 'tool_use', id: 's1', name: 'pedir_sorteio', input: {} },
          { type: 'tool_use', id: 's2', name: 'pedir_sorteio', input: {} },
        ],
        'tool_use',
      );
      const { cliente, pedidos } = falso(usos, texto('Sorteado!'));
      expect(await perguntar('sorteia duas vezes', base(cliente, [sorteio(executar)]))).toBe(`Sorteado!\n\n${PROPOSTA}`);
      expect(executar).toHaveBeenCalledTimes(1);
      expect(resultadosDe(pedidos[1], 2)[1]).toEqual({ type: 'tool_result', tool_use_id: 's2', is_error: true, content: 'O sorteio já foi pedido nesta mensagem.' });
    });

    it('falha depois da proposta: a proposta sai mesmo assim (é ela que o "sim" salva)', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { cliente } = falso(chamada('pedir_sorteio', {}), mensagem([{ type: 'text', text: 'não' }], 'refusal'));
      expect(await perguntar('sorteia', base(cliente, [sorteio()]))).toBe(PROPOSTA);
      log.mockRestore();
    });

    it('proposta que chega depois do prazo é descartada (nunca fica uma proposta que ninguém viu)', async () => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const descartar = vi.fn();
      let soltar: (v: TextoPronto) => void = () => {};
      const lenta = ferramenta('pedir_sorteio', () => new Promise<TextoPronto>((r) => (soltar = r)), { sorteio: true });
      expect(await perguntar('sorteia', { ...base(falso(chamada('pedir_sorteio', {})).cliente, [lenta]), prazoMs: 20 })).toBe(ERRO);
      soltar(new TextoPronto(PROPOSTA, 'sorteio', descartar));
      await new Promise((r) => setTimeout(r, 10));
      expect(descartar).toHaveBeenCalledTimes(1);
      log.mockRestore();
    });
  });
});

describe('resenha e mensagens em partes', () => {
  it('o jeito do robô: entra na resenha em assunto de fora, mas não inventa dado da pelada', () => {
    expect(SISTEMA).toMatch(/resenha/);
    expect(SISTEMA).toMatch(/CR7, Messi ou Jonas/);
    expect(SISTEMA).toMatch(/Nunca invente jogador, número ou data/);
    expect(SISTEMA).toMatch(/nunca use a palavra "careca"/i);
  });

  it('a fala sai em uma mensagem por parágrafo; os textos prontos vêm inteiros depois', async () => {
    const executar = vi.fn(async () => new TextoPronto('✅ Ana confirmado! (pedido por Zeca)', 'acao'));
    const { cliente } = falso(chamada('confirmar_jogador', { nome: 'Ana' }), texto('Fechou!\n\nAna tá dentro 💪'));
    const partes = await perguntarEmPartes('confirma a Ana', base(cliente, [ferramenta('confirmar_jogador', executar, { altera: true })]));
    expect(partes).toEqual(['Fechou!', 'Ana tá dentro 💪', '✅ Ana confirmado! (pedido por Zeca)']);
    // `perguntar` junta as mesmas partes num texto só (o grupo recebe uma mensagem).
    const { cliente: c2 } = falso(chamada('confirmar_jogador', { nome: 'Ana' }), texto('Fechou!\n\nAna tá dentro 💪'));
    expect(await perguntar('confirma a Ana', base(c2, [ferramenta('confirmar_jogador', executar, { altera: true })]))).toBe('Fechou!\n\nAna tá dentro 💪\n\n✅ Ana confirmado! (pedido por Zeca)');
  });

  it('a lista repetida na fala sai inteira numa mensagem só, no lugar dela (antes saía picotada por parágrafo)', async () => {
    const listaTexto = '🔄 Status: sem nenhuma atualização.\n\nPelada 18/11 - 20:30-22:30\n\n 1. Caio (M) ✅\n 2. Davi (D) ⏳\n\nInteressados pra diarista\n 1. Bia';
    const verLista = ferramenta('ver_lista', async () => new TextoPronto(listaTexto, 'lista'));
    const { cliente } = falso(chamada('ver_lista', {}), texto(`Beleza, segue a lista:\n\n${listaTexto}\n\nQuer sortear?`));
    expect(await perguntarEmPartes('lista?', base(cliente, [verLista]))).toEqual(['Beleza, segue a lista:', listaTexto, 'Quer sortear?']);
  });

  it('o ranking (texto pronto de consulta) vai inteiro mesmo quando a fala só diz "esse é o ranking"', async () => {
    const ranking = '🏆 Ranking (novembro):\n🥇 Gabriel 1\n🥈 Gianluca 1';
    const f = ferramenta('ranking', async () => new TextoPronto(ranking, 'lista'));
    const { cliente } = falso(chamada('ranking', {}), texto('Esse é o ranking de novembro, todo mundo com 1 ponto.'));
    expect(await perguntarEmPartes('ranking?', base(cliente, [f]))).toEqual(['Esse é o ranking de novembro, todo mundo com 1 ponto.', ranking]);
  });

  it('no máximo 5 mensagens de fala: o resto vai junto na última', async () => {
    const { cliente } = falso(texto('1\n\n2\n\n3\n\n4\n\n5\n\n6\n\n7'));
    expect(await perguntarEmPartes('x', base(cliente))).toEqual(['1', '2', '3', '4', '5\n\n6\n\n7']);
  });

  it('falha: o erro numa mensagem só', async () => {
    const { cliente } = falso(async () => {
      throw new Error('caiu');
    });
    expect(await perguntarEmPartes('x', base(cliente))).toEqual([ERRO_IA]);
  });

  it('no privado, a mensagem do usuário pede mensagens curtas, separadas por linha em branco', async () => {
    const { cliente, pedidos } = falso(texto('a'));
    await perguntarEmPartes('x', { ...base(cliente), privado: true });
    expect(JSON.stringify(pedidos[0].messages[0])).toContain('mensagens curtas, uma ideia por mensagem');
  });
});

describe('ferramentas estritas (limite da Anthropic: 20)', () => {
  const comArg = (nome: string) => ferramenta(nome, undefined, { parametros: { type: 'object', properties: { nome: { type: 'string' } }, required: ['nome'], additionalProperties: false } });

  it('só as ferramentas com argumentos vão como strict', () => {
    const tools = paraTools([ferramenta('ver_lista'), comArg('adicionar_jogador')]);
    expect(tools.map((t) => [t.name, t.strict])).toEqual([['ver_lista', undefined], ['adicionar_jogador', true]]);
  });

  it('nunca passa de 20 estritas, mesmo com mais ferramentas com argumentos', () => {
    const muitas = Array.from({ length: 25 }, (_, i) => comArg(`f${i}`));
    expect(paraTools(muitas).filter((t) => t.strict).length).toBe(MAX_FERRAMENTAS_ESTRITAS);
  });

  it('o pedido de verdade vai com no máximo 20 estritas (o erro 400 do privado)', async () => {
    const { cliente, pedidos } = falso(texto('ok'));
    const muitas = [...Array.from({ length: 25 }, (_, i) => comArg(`f${i}`)), ferramenta('sem_arg')];
    await perguntar('x', base(cliente, muitas));
    const tools = pedidos[0].tools as { strict?: boolean }[];
    expect(tools.filter((t) => t.strict).length).toBeLessThanOrEqual(20);
  });
});

describe('privado: histórico da conversa e link repetido', () => {
  it('as falas anteriores vão antes da mensagem atual, como texto', async () => {
    const { cliente, pedidos } = falso(texto('Trocado!'));
    await perguntarEmPartes('troca o caio pelo jonas', {
      ...base(cliente),
      privado: true,
      historico: [
        { papel: 'user', texto: 'sortear' },
        { papel: 'assistant', texto: '🎲 Times sorteados…' },
      ],
    });
    const ms = pedidos[0].messages;
    expect(ms.slice(0, 2)).toEqual([
      { role: 'user', content: 'sortear' },
      { role: 'assistant', content: '🎲 Times sorteados…' },
    ]);
    expect(ms[2].role).toBe('user');
    expect(String(ms[2].content)).toContain('Mensagem: troca o caio pelo jonas');
  });

  it('a fala que repete o link do texto pronto sai; o resto da fala fica', async () => {
    const PRONTO = '📝 Link para anotar as partidas de quarta, 18/11:\nhttps://site/anotar/ABC\nAbre direto na tela de partidas, sem senha.';
    const anotar = ferramenta('link_de_anotar', async () => new TextoPronto(PRONTO, 'acao'));
    const { cliente } = falso(chamada('link_de_anotar', {}), texto('Toma o link!\n\nhttps://site/anotar/ABC'));
    expect(await perguntarEmPartes('quero o link', { ...base(cliente, [anotar]), privado: true })).toEqual(['Toma o link!', PRONTO]);
  });
});
