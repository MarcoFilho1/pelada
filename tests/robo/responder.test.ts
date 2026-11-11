import { describe, expect, it, vi } from 'vitest';
import { textoWhatsApp } from '@/domain/copiarLista';
import type { EstadoDaSemana } from '@/server/presencas';
import type { Envio, EstadoDoRobo } from '@/robo/agenda';
import { TEXTO_AJUDA } from '@/robo/comandos';
import { fotografar } from '@/robo/foto';
import { Freio, LIMITE_PERGUNTAS, LIMITE_RESPOSTAS, TEXTO_LIMITE } from '@/robo/freio';
import { calvinhoDoEnv, ferramentasDeAcao, PREFIXO_NAO_ENTENDI, PREFIXOS_CALVINHO, SALVO_CALVINHO, configDasRespostas, podeGravarLista, responder, type ContextoDaResposta, type MensagemRecebida } from '@/robo/responder';
import { CALVINHO } from '@/robo/lista-zap';
import { ErroDeFerramenta, TextoPronto } from '@/robo/ferramentas';
import { TEXTO_SO_ADMIN, type Proposta } from '@/robo/sorteio-zap';

const t = (s: string) => new Date(`${s}-03:00`);
const GRUPO = 'g@g.us';
// Números fictícios.
const ADMIN = '5581990000001';
const OUTRO_ADMIN = '5581990000002';
const QUALQUER = '5581990000009';

const lista: EstadoDaSemana = {
  aberta: true,
  cancelada: false,
  principal: [
    { jogadorId: 1, nome: 'Ana', tipo: 'M', confirmado: true },
    { jogadorId: 2, nome: 'Bia', tipo: 'M', confirmado: false },
  ],
  fila: [{ jogadorId: 3, nome: 'Caio', tipo: 'D', confirmado: false }],
  vagas: 16,
  peladaId: 1,
  data: '2026-11-11',
  estadoManual: null,
  foraDoPrazo: [],
};

function msg(texto: string, over: Partial<MensagemRecebida> = {}): MensagemRecebida {
  return { grupoId: GRUPO, remetenteTelefone: QUALQUER, remetenteNome: 'Zeca', texto, mencionaORobo: true, respondeAoRobo: false, quando: t('2026-11-10T15:40:00'), ...over };
}

function proposta(over: Partial<Proposta> = {}): Proposta {
  return { adminTelefone: ADMIN, criadaEm: t('2026-11-11T15:00:00'), peladaId: 1, elencos: [[1], [2]], completes: [[], []], texto: 'Times propostos', ...over };
}

function ctx(over: Partial<ContextoDaResposta> = {}, relogio = () => t('2026-11-10T15:40:00')) {
  const c = {
    estadoGrupoId: GRUPO,
    freio: new Freio(relogio),
    admins: [ADMIN, OUTRO_ADMIN],
    ia: { chave: 'chave-falsa', modelo: 'claude-haiku-5-5' },
    ultimo: null as Envio | null,
    proposta: { atual: null as Proposta | null },
    lerLista: vi.fn(async () => lista),
    propor: vi.fn(async (now: Date, tel: string) => proposta({ adminTelefone: tel, criadaEm: now })),
    confirmar: vi.fn(async (): Promise<{ ok: string } | { erro: string }> => ({ ok: '🏆 Times definitivos salvos!' })),
    perguntar: vi.fn(async () => 'O João está na lista.'),
    mexerNaLista: vi.fn(async (): Promise<{ texto: string; mudou: boolean }> => ({ texto: 'Pepe entrou na lista.', mudou: true })),
    consultar: vi.fn(async () => '⚽ Artilheiros (novembro):\n1. Pepe 5'),
    enviar: vi.fn(async () => {}),
    log: vi.fn(),
    ...over,
  };
  return c;
}

describe('responder: quando não responde', () => {
  it('sem marcação, outro grupo ou grupo não configurado: ignora', async () => {
    const c = ctx();
    expect(await responder(msg('lista', { mencionaORobo: false }), c)).toBeNull();
    expect(await responder(msg('lista', { grupoId: 'outro@g.us' }), c)).toBeNull();
    expect(await responder(msg('lista'), { ...c, estadoGrupoId: null })).toBeNull();
    expect(c.enviar).not.toHaveBeenCalled();
    expect(c.lerLista).not.toHaveBeenCalled();
  });

  it('silêncio 23:00–08:00: não responde (nem sorteio)', async () => {
    for (const quando of [t('2026-11-10T23:00:00'), t('2026-11-11T02:00:00'), t('2026-11-11T07:59:00')]) {
      const c = ctx();
      expect(await responder(msg('lista', { quando }), c)).toBeNull();
      expect(await responder(msg('sortear', { quando, remetenteTelefone: ADMIN }), c)).toBeNull();
      expect(c.enviar).not.toHaveBeenCalled();
    }
    const c = ctx();
    expect(await responder(msg('ajuda', { quando: t('2026-11-11T08:00:00') }), c)).not.toBeNull();
  });

  it('sem espera por minuto: marcações seguidas são todas respondidas', async () => {
    const c = ctx();
    expect((await responder(msg('ajuda'), c))?.texto).toContain(TEXTO_AJUDA);
    expect((await responder(msg('fila'), c))?.texto).toBe('📝 Fila:\n1. Caio');
    expect((await responder(msg('falta'), c))?.texto).toBe('⏳ Ainda não confirmaram: Bia.');
  });

  it('limite de 10 por minuto: a 11ª não responde e não registra resposta', async () => {
    const c = ctx();
    for (let i = 0; i < LIMITE_RESPOSTAS; i++) expect(await responder(msg('fila'), c)).not.toBeNull();
    const registrar = vi.spyOn(c.freio, 'registrarResposta');
    expect(await responder(msg('fila'), c)).toBeNull();
    expect(registrar).not.toHaveBeenCalled();
    expect(vi.mocked(c.enviar).mock.calls.filter((x) => x[0] === '📝 Fila:\n1. Caio')).toHaveLength(LIMITE_RESPOSTAS);
  });

  it('registra a resposta só depois de enviar; envio que falha é registrado no log e não conta', async () => {
    const c = ctx();
    const registrar = vi.spyOn(c.freio, 'registrarResposta');
    await responder(msg('ajuda'), c);
    expect(c.enviar).toHaveBeenCalledWith(expect.stringContaining(TEXTO_AJUDA));
    expect(registrar).toHaveBeenCalledTimes(1);
    expect(vi.mocked(c.enviar).mock.invocationCallOrder[0]).toBeLessThan(registrar.mock.invocationCallOrder[0]);

    const f = ctx({ enviar: vi.fn(async () => Promise.reject(new Error('sem rede'))) });
    const registrarF = vi.spyOn(f.freio, 'registrarResposta');
    expect(await responder(msg('ajuda'), f)).toBeNull();
    expect(registrarF).not.toHaveBeenCalled();
    expect(f.log).toHaveBeenCalledWith(expect.stringContaining('sem rede'));
    expect(f.enviar).toHaveBeenCalledTimes(1);
  });
});

describe('responder: comandos fixos', () => {
  it('ajuda, falta confirmar e fila', async () => {
    expect((await responder(msg('ajuda'), ctx({ ia: null })))?.texto).toBe(TEXTO_AJUDA);
    expect((await responder(msg('falta confirmar'), ctx()))?.texto).toBe('⏳ Ainda não confirmaram: Bia.');
    expect((await responder(msg('fila'), ctx()))?.texto).toBe('📝 Fila:\n1. Caio');
  });

  it('respostas que não são a lista completa não marcam ehListaCompleta', async () => {
    const r = await responder(msg('fila'), ctx());
    expect(r?.ehListaCompleta).toBe(false);
  });
});

describe('responder: lista', () => {
  const ultimoSemMudanca: Envio = { quando: t('2026-11-10T15:30:10').toISOString(), rodada: t('2026-11-10T15:30:00').toISOString(), tipo: 'rodada', foto: fotografar(lista) };

  it('sem mudança desde a última mensagem do robô: "🔄 Status: sem nenhuma atualização." + linha em branco + lista completa', async () => {
    const c = ctx({ ultimo: ultimoSemMudanca });
    const r = await responder(msg('lista'), c);
    expect(r?.texto).toBe(`🔄 Status: sem nenhuma atualização.\n\n${textoWhatsApp(lista, lista.data)}`);
    expect(r?.texto).toContain('Ana');
    expect(r?.texto).toContain('Caio');
    // Reenvio sem mudança não precisa virar a última lista.
    expect(r?.ehListaCompleta).toBe(false);
    expect(r?.gravar).toBeUndefined();
    expect(c.enviar).toHaveBeenCalledWith(r?.texto);
  });

  it('marcação sem texto também é a lista', async () => {
    const r = await responder(msg(''), ctx({ ultimo: ultimoSemMudanca }));
    expect(r?.texto.startsWith('🔄 Status: sem nenhuma atualização.\n\n')).toBe(true);
  });

  it('nunca manda a frase curta antiga', async () => {
    const r = await responder(msg('lista'), ctx({ ultimo: ultimoSemMudanca }));
    expect(r?.texto).not.toContain('não mudou desde');
  });

  it('com mudança: cabeçalho + lista completa, marca ehListaCompleta com a foto para gravar', async () => {
    const antes = fotografar({ ...lista, fila: [] });
    const c = ctx({ ultimo: { ...ultimoSemMudanca, foto: antes } });
    const r = await responder(msg('lista'), c);
    expect(r?.ehListaCompleta).toBe(true);
    expect(r?.texto.split('\n')[0]).toBe('📝 Entraram na fila: Caio.');
    expect(r?.texto).toContain('Ana');
    expect(r?.texto).toContain('Caio');
    expect(r?.gravar).toEqual({ tipo: 'rodada', foto: fotografar(lista) });
  });

  it('sem mensagem anterior da semana: lista completa com o título da semana', async () => {
    const c = ctx({ ultimo: { ...ultimoSemMudanca, foto: { ...fotografar(lista), dataQuarta: '2026-11-04' } } });
    const r = await responder(msg('lista'), c);
    expect(r?.texto.startsWith('📋 Lista de quarta, 11/11:')).toBe(true);
    expect(r).toMatchObject({ ehListaCompleta: true, gravar: { tipo: 'primeira' } });
  });

  it('fora da janela (sábado): responde a lista, mas não vira a última lista das rodadas', async () => {
    const c = ctx({}, () => t('2026-11-14T10:00:00'));
    const r = await responder(msg('lista', { quando: t('2026-11-14T10:00:00') }), c);
    expect(c.enviar).toHaveBeenCalledTimes(1);
    expect(r?.texto).toContain('Ana');
    expect(podeGravarLista(t('2026-11-14T10:00:05'), r!.gravar!.foto, { ultimo: null, aberturaEnviada: null, grupoId: GRUPO })).toBe(false);
    expect(c.lerLista).toHaveBeenCalledWith(t('2026-11-14T10:00:00'));
  });

  it('pelada cancelada desde a última mensagem: avisa o cancelamento e grava como cancelada', async () => {
    const c = ctx({ ultimo: ultimoSemMudanca, lerLista: vi.fn(async () => ({ ...lista, estadoManual: 'cancelada' as const })) });
    const r = await responder(msg('lista'), c);
    expect(r?.texto).toBe('🌧️ A pelada de quarta, 11/11 foi cancelada.');
    expect(r?.gravar?.tipo).toBe('cancelada');
  });
});

describe('responder: pergunta livre', () => {
  it('sem chave ou sem modelo: responde a lista de comandos', async () => {
    const c = ctx({ ia: null });
    expect((await responder(msg('quem é o artilheiro?'), c))?.texto).toBe(TEXTO_AJUDA);
    expect(c.perguntar).not.toHaveBeenCalled();
  });

  it('pergunta à IA com o relógio e conta a pergunta', async () => {
    const c = ctx();
    const registrar = vi.spyOn(c.freio, 'registrarPergunta');
    const r = await responder(msg('o João está na lista?'), c);
    expect(r).toMatchObject({ texto: 'O João está na lista.', ehListaCompleta: false });
    expect(c.perguntar).toHaveBeenCalledWith(
      'o João está na lista?',
      expect.objectContaining({ agora: expect.any(Function), quem: 'Zeca', ehJonas: false, acoes: expect.arrayContaining([expect.objectContaining({ nome: 'adicionar_jogador' })]) }),
    );
    expect(registrar).toHaveBeenCalledTimes(1);
  });

  it('passou do limite do dia: texto do limite, sem chamar a IA', async () => {
    const c = ctx();
    for (let i = 0; i < LIMITE_PERGUNTAS; i++) c.freio.registrarPergunta();
    expect((await responder(msg('quem é o artilheiro?'), c))?.texto).toBe(TEXTO_LIMITE);
    expect(c.perguntar).not.toHaveBeenCalled();
  });
});

describe('responder: sorteio', () => {
  // Cada passo um minuto depois, para o freio deixar responder.
  const relogio = (() => {
    let n = 0;
    return { agora: () => new Date(t('2026-11-11T15:00:00').getTime() + n * 60_000), andar: () => n++ };
  })();
  const passo = (texto: string, c: ReturnType<typeof ctx>, tel: string | null) => {
    relogio.andar();
    return responder(msg(texto, { remetenteTelefone: tel, quando: relogio.agora() }), c);
  };

  it('quem não é admin (ou sem telefone) recebe o aviso, sem propor', async () => {
    const c = ctx({}, relogio.agora);
    expect((await passo('sortear', c, QUALQUER))?.texto).toBe(TEXTO_SO_ADMIN);
    expect((await passo('sortear', c, null))?.texto).toBe(TEXTO_SO_ADMIN);
    expect(c.propor).not.toHaveBeenCalled();
    expect(c.proposta.atual).toBeNull();
  });

  it('admin: propõe, guarda uma proposta só (a nova substitui a antiga)', async () => {
    const c = ctx({}, relogio.agora);
    expect((await passo('sortear', c, ADMIN))?.texto).toBe('Times propostos');
    expect(c.proposta.atual?.adminTelefone).toBe(ADMIN);
    await passo('sorteia', c, OUTRO_ADMIN);
    expect(c.proposta.atual?.adminTelefone).toBe(OUTRO_ADMIN);
    expect(c.propor).toHaveBeenCalledTimes(2);
  });

  it('erro ao propor: responde o erro e não guarda nada', async () => {
    const c = ctx({ propor: vi.fn(async () => ({ erro: '📅 Hoje não tem pelada para sortear.' })) }, relogio.agora);
    expect((await passo('sortear', c, ADMIN))?.texto).toBe('📅 Hoje não tem pelada para sortear.');
    expect(c.proposta.atual).toBeNull();
  });

  it('"sim" confirma a proposta guardada e a apaga; o segundo "sim" não tem o que confirmar', async () => {
    const c = ctx({}, relogio.agora);
    await passo('sortear', c, ADMIN);
    const guardada = c.proposta.atual;
    expect((await passo('sim', c, ADMIN))?.texto).toBe('🏆 Times definitivos salvos!');
    expect(c.confirmar).toHaveBeenCalledWith(expect.any(Date), ADMIN, guardada);
    expect(c.proposta.atual).toBeNull();
    expect((await passo('sim', c, ADMIN))?.texto).toBe('🤔 Não tem sorteio esperando confirmação.');
    expect(c.confirmar).toHaveBeenCalledTimes(1);
  });

  it('"sim" de outra pessoa: não apaga a proposta (quem pediu ainda pode confirmar)', async () => {
    const c = ctx({ confirmar: vi.fn(async () => ({ erro: '🔐 Só quem pediu o sorteio pode confirmar.' })) }, relogio.agora);
    await passo('sortear', c, ADMIN);
    expect((await passo('sim', c, QUALQUER))?.texto).toBe('🔐 Só quem pediu o sorteio pode confirmar.');
    expect(c.proposta.atual).not.toBeNull();
  });

  it('proposta expirada: responde a expiração e apaga; o "sim" seguinte não tem o que confirmar', async () => {
    const c = ctx({ confirmar: vi.fn(async () => ({ erro: '⌛ A proposta expirou. Peça *sortear* de novo.' })) }, relogio.agora);
    c.proposta.atual = proposta({ criadaEm: new Date(relogio.agora().getTime() - 20 * 60_000) });
    expect((await passo('sim', c, ADMIN))?.texto).toBe('⌛ A proposta expirou. Peça *sortear* de novo.');
    expect(c.proposta.atual).toBeNull();
    expect((await passo('sim', c, ADMIN))?.texto).toBe('🤔 Não tem sorteio esperando confirmação.');
  });

  it('"sim" de quem não é admin, sem proposta: não tem o que confirmar', async () => {
    const c = ctx({}, relogio.agora);
    expect((await passo('sim', c, QUALQUER))?.texto).toBe('🤔 Não tem sorteio esperando confirmação.');
    expect(c.confirmar).not.toHaveBeenCalled();
  });

  it('"sim" de quem pediu, no mesmo minuto do sortear: o freio não bloqueia e a resposta conta', async () => {
    const c = ctx({}, relogio.agora);
    relogio.andar();
    const quando = relogio.agora();
    await responder(msg('sortear', { remetenteTelefone: ADMIN, quando }), c);
    const registrar = vi.spyOn(c.freio, 'registrarResposta');
    expect((await responder(msg('sim', { remetenteTelefone: ADMIN, quando }), c))?.texto).toBe('🏆 Times definitivos salvos!');
    expect(registrar).toHaveBeenCalledTimes(1);
  });

  it('com o limite de 10 por minuto cheio: o "sim" de outra pessoa é barrado, o de quem pediu passa', async () => {
    const c = ctx({}, relogio.agora);
    relogio.andar();
    const quando = relogio.agora();
    await responder(msg('sortear', { remetenteTelefone: ADMIN, quando }), c);
    for (let i = 1; i < LIMITE_RESPOSTAS; i++) await responder(msg('fila', { quando }), c);
    expect(await responder(msg('sim', { remetenteTelefone: QUALQUER, quando }), c)).toBeNull();
    expect(c.confirmar).not.toHaveBeenCalled();
    expect((await responder(msg('sim', { remetenteTelefone: ADMIN, quando }), c))?.texto).toBe('🏆 Times definitivos salvos!');
  });

  it('"sim" respondendo (citando) a proposta, sem marcar o robô: confirma', async () => {
    const c = ctx({}, relogio.agora);
    await passo('sortear', c, ADMIN);
    relogio.andar();
    const r = await responder(msg('sim', { remetenteTelefone: ADMIN, quando: relogio.agora(), mencionaORobo: false, respondeAoRobo: true }), c);
    expect(r?.texto).toBe('🏆 Times definitivos salvos!');
  });

  it('citação do robô sem marcação: só o "sim" com proposta guardada conta', async () => {
    const c = ctx({}, relogio.agora);
    const cita = (texto: string) => {
      relogio.andar();
      return responder(msg(texto, { remetenteTelefone: ADMIN, quando: relogio.agora(), mencionaORobo: false, respondeAoRobo: true }), c);
    };
    expect(await cita('sim')).toBeNull(); // sem proposta
    expect(await cita('lista')).toBeNull();
    expect(await cita('quem é o artilheiro?')).toBeNull();
    await passo('sortear', c, ADMIN);
    expect(await cita('legal')).toBeNull();
    expect(c.enviar).toHaveBeenCalledTimes(1);
  });

  it('sortear ou sim de remetente sem telefone (só LID): registra uma linha no log', async () => {
    const c = ctx({}, relogio.agora);
    await passo('sortear', c, null);
    expect(c.log).toHaveBeenCalledWith('marcação de remetente sem telefone (LID): não dá para saber se é organizador');
    vi.mocked(c.log).mockClear();
    await passo('sim', c, null);
    expect(c.log).toHaveBeenCalledWith('marcação de remetente sem telefone (LID): não dá para saber se é organizador');
    vi.mocked(c.log).mockClear();
    await passo('fila', c, null);
    expect(c.log).not.toHaveBeenCalled();
  });

  it('pedido de sorteio em texto livre vai para a IA, que só pode sortear pela ferramenta pedir_sorteio (com a checagem de admin)', async () => {
    const c = ctx({}, relogio.agora);
    await passo('sorteia os times aí', c, ADMIN);
    // O comando não sorteia sozinho: quem decide chamar a ferramenta é a IA.
    expect(c.propor).not.toHaveBeenCalled();
    expect(c.perguntar).toHaveBeenCalledWith('sorteia os times aí', expect.objectContaining({ acoes: expect.arrayContaining([expect.objectContaining({ nome: 'pedir_sorteio', sorteio: true })]) }));
    expect(c.perguntar).toHaveBeenCalledWith('sorteia os times aí', expect.objectContaining({ acoes: expect.not.arrayContaining([expect.objectContaining({ nome: 'confirmar_sorteio' })]) }));
  });
});

describe('configDasRespostas (.env)', () => {
  it('ANTHROPIC_API_KEY liga as perguntas com o claude-haiku-5-5; admins separados por vírgula', () => {
    expect(configDasRespostas({ ANTHROPIC_API_KEY: ' k ', ROBO_ADMINS: `${ADMIN}, ${OUTRO_ADMIN} ,` })).toEqual({
      ia: { chave: 'k', modelo: 'claude-haiku-5-5' },
      admins: [ADMIN, OUTRO_ADMIN],
    });
  });

  it('ROBO_MODELO troca o modelo', () => {
    expect(configDasRespostas({ ANTHROPIC_API_KEY: 'k', ROBO_MODELO: ' claude-sonnet-5-5 ' }).ia).toEqual({ chave: 'k', modelo: 'claude-sonnet-5-5' });
    expect(configDasRespostas({ ANTHROPIC_API_KEY: 'k', ROBO_MODELO: '  ' }).ia).toEqual({ chave: 'k', modelo: 'claude-haiku-5-5' });
  });

  it('sem chave: perguntas desligadas (a chave antiga da OpenRouter não vale mais); sem admins: lista vazia', () => {
    expect(configDasRespostas({ ROBO_MODELO: 'claude-haiku-5-5' })).toEqual({ ia: null, admins: [] });
    expect(configDasRespostas({ ANTHROPIC_API_KEY: '   ' })).toEqual({ ia: null, admins: [] });
    expect(configDasRespostas({ OPENROUTER_API_KEY: 'k', OPENROUTER_MODEL: 'm/x' })).toEqual({ ia: null, admins: [] });
  });
});

describe('ferramentasDeAcao (comandos em linguagem natural pela IA)', () => {
  const nomes = ['adicionar_jogador', 'confirmar_jogador', 'remover_jogador', 'ver_lista', 'quem_falta_confirmar', 'ver_fila', 'ver_times', 'artilheiros', 'garcons', 'ranking', 'pedir_sorteio'];
  const achar = (fs: ReturnType<typeof ferramentasDeAcao>, nome: string) => fs.find((f) => f.nome === nome)!;

  it('as onze ações, com schema estrito e nenhuma que confirme sorteio', () => {
    const fs = ferramentasDeAcao(msg('x'), ctx());
    expect(fs.map((f) => f.nome)).toEqual(nomes);
    for (const f of fs) {
      expect(f.parametros).toMatchObject({ type: 'object', additionalProperties: false });
      expect(f.nome).not.toMatch(/confirmar_sorteio|sim/);
    }
    for (const n of ['adicionar_jogador', 'confirmar_jogador', 'remover_jogador']) {
      expect(achar(fs, n).parametros).toEqual({ type: 'object', properties: { nome: expect.objectContaining({ type: 'string' }) }, required: ['nome'], additionalProperties: false });
      expect(achar(fs, n).altera).toBe(true);
    }
    expect(achar(fs, 'pedir_sorteio').sorteio).toBe(true);
    expect(fs.filter((f) => f.altera || f.sorteio).map((f) => f.nome)).toEqual(['adicionar_jogador', 'confirmar_jogador', 'remover_jogador', 'pedir_sorteio']);
  });

  it('as descrições não mudam com quem pergunta (prefixo do cache estável)', () => {
    const a = ferramentasDeAcao(msg('x'), ctx()).map(({ nome, descricao, parametros }) => ({ nome, descricao, parametros }));
    const b = ferramentasDeAcao(msg('y', { remetenteNome: 'Jonas', remetenteTelefone: ADMIN }), ctx()).map(({ nome, descricao, parametros }) => ({ nome, descricao, parametros }));
    expect(b).toEqual(a);
  });

  it.each([
    ['adicionar_jogador', 'adicionar'],
    ['confirmar_jogador', 'confirmar'],
    ['remover_jogador', 'remover'],
  ] as const)('%s chama mexerNaLista com o nome e devolve o texto com "pedido por" de quem mandou', async (ferramenta, acao) => {
    const c = ctx();
    const m = msg('põe o pepe aí', { remetenteNome: 'Zeca' });
    expect(await achar(ferramentasDeAcao(m, c), ferramenta).executar({ nome: 'Pepe' })).toEqual(new TextoPronto('Pepe entrou na lista. (pedido por Zeca)', 'acao'));
    expect(c.mexerNaLista).toHaveBeenCalledWith(acao, 'Pepe', m.quando);
  });

  it('ação que não muda a lista (recusa do site, não achou) ou nome comprido/inválido: erro da ferramenta com o texto, sem "pedido por"', async () => {
    const c = ctx({ mexerNaLista: vi.fn(async () => ({ texto: '🤔 Zé não está cadastrado.', mudou: false })) });
    const fs = ferramentasDeAcao(msg('x'), c);
    await expect(achar(fs, 'adicionar_jogador').executar({ nome: 'Zé' })).rejects.toEqual(new ErroDeFerramenta('🤔 Zé não está cadastrado.'));
    await expect(achar(fs, 'adicionar_jogador').executar({ nome: 'x'.repeat(41) })).rejects.toEqual(new ErroDeFerramenta('🤔 Nome muito comprido.'));
    await expect(achar(fs, 'adicionar_jogador').executar({ nome: 42 })).rejects.toBeInstanceOf(ErroDeFerramenta);
    await expect(achar(fs, 'adicionar_jogador').executar({ nome: '   ' })).rejects.toBeInstanceOf(ErroDeFerramenta);
    expect(c.mexerNaLista).toHaveBeenCalledTimes(1);
  });

  it('sem pushName: "pedido por alguém", nunca o telefone', async () => {
    const r = (await achar(ferramentasDeAcao(msg('x', { remetenteNome: null }), ctx()), 'remover_jogador').executar({ nome: 'Pepe' })) as TextoPronto;
    expect(r.texto).toBe('Pepe entrou na lista. (pedido por alguém)');
    expect(r.texto).not.toContain(QUALQUER);
  });

  it('consultas devolvem os mesmos textos dos comandos', async () => {
    const c = ctx();
    const fs = ferramentasDeAcao(msg('x'), c);
    expect(await achar(fs, 'quem_falta_confirmar').executar({})).toBe('⏳ Ainda não confirmaram: Bia.');
    expect(await achar(fs, 'ver_fila').executar({})).toBe('📝 Fila:\n1. Caio');
    const textoLista = (await achar(fs, 'ver_lista').executar({})) as TextoPronto;
    expect(textoLista.como).toBe('lista');
    expect(textoLista.texto).toContain(textoWhatsApp(lista, lista.data));
    for (const [ferramenta, tipo] of [['ver_times', 'times'], ['artilheiros', 'artilheiro'], ['garcons', 'garcom'], ['ranking', 'ranking']] as const) {
      expect(await achar(fs, ferramenta).executar({})).toBe('⚽ Artilheiros (novembro):\n1. Pepe 5');
      expect(c.consultar).toHaveBeenLastCalledWith(tipo, expect.any(Date));
    }
  });

  it('pedir_sorteio: admin pelo telefone da mensagem; guarda a proposta como o comando, e o "sim" confirma', async () => {
    const quando = t('2026-11-11T15:00:00');
    const c = ctx({}, () => quando);
    const r = (await achar(ferramentasDeAcao(msg('sorteia aí', { remetenteTelefone: ADMIN, quando }), c), 'pedir_sorteio').executar({})) as TextoPronto;
    expect(r).toMatchObject({ texto: 'Times propostos', como: 'sorteio' });
    expect(c.propor).toHaveBeenCalledWith(quando, ADMIN);
    expect(c.proposta.atual).toMatchObject({ adminTelefone: ADMIN, texto: 'Times propostos' });
    const sim = await responder(msg('sim', { remetenteTelefone: ADMIN, quando: t('2026-11-11T15:02:00') }), c);
    expect(sim?.texto).toBe('🏆 Times definitivos salvos!');
    expect(c.confirmar).toHaveBeenCalledWith(t('2026-11-11T15:02:00'), ADMIN, expect.objectContaining({ texto: 'Times propostos' }));
  });

  it('pedir_sorteio: descartar a proposta (chegou depois do prazo) limpa só ela', async () => {
    const quando = t('2026-11-11T15:00:00');
    const c = ctx({}, () => quando);
    const r = (await achar(ferramentasDeAcao(msg('sorteia', { remetenteTelefone: ADMIN, quando }), c), 'pedir_sorteio').executar({})) as TextoPronto;
    expect(c.proposta.atual).not.toBeNull();
    r.descartar?.();
    expect(c.proposta.atual).toBeNull();
  });

  it('pedir_sorteio que dá erro do sorteio (hoje não tem pelada): erro da ferramenta, nada guardado', async () => {
    const c = ctx({ propor: vi.fn(async () => ({ erro: '📅 Hoje não tem pelada para sortear.' })) });
    await expect(achar(ferramentasDeAcao(msg('sorteia', { remetenteTelefone: ADMIN }), c), 'pedir_sorteio').executar({})).rejects.toEqual(new ErroDeFerramenta('📅 Hoje não tem pelada para sortear.'));
    expect(c.proposta.atual).toBeNull();
  });

  it('pedir_sorteio de quem não é admin (ou sem telefone): recusa, mesmo que a IA chame a ferramenta', async () => {
    for (const remetenteTelefone of [QUALQUER, null]) {
      const c = ctx();
      await expect(achar(ferramentasDeAcao(msg('sorteia', { remetenteTelefone }), c), 'pedir_sorteio').executar({ telefone: ADMIN })).rejects.toEqual(new ErroDeFerramenta(TEXTO_SO_ADMIN));
      expect(c.propor).not.toHaveBeenCalled();
      expect(c.proposta.atual).toBeNull();
    }
  });
});

describe('podeGravarLista (resposta com a lista não engole as mensagens fixas)', () => {
  const foto = fotografar(lista);
  const antes = fotografar({ ...lista, fila: [] });
  const envio = (iso: string, f = antes): Envio => ({ quando: t(iso).toISOString(), rodada: t(iso.slice(0, 14) + (Number(iso.slice(14, 16)) >= 30 ? '30' : '00') + ':00').toISOString(), tipo: 'rodada', foto: f });
  const estado = (over: Partial<EstadoDoRobo> = {}): EstadoDoRobo => ({ ultimo: envio('2026-11-11T11:30:00'), aberturaEnviada: '2026-11-11', grupoId: GRUPO, ...over });

  it('quarta 12:00:05 com mensalista pendente: não grava (o lembrete ainda vai sair)', () => {
    expect(podeGravarLista(t('2026-11-11T12:00:05'), foto, estado())).toBe(false);
  });

  it('quarta 14:00:05: não grava (o aviso do prazo ainda vai sair)', () => {
    expect(podeGravarLista(t('2026-11-11T14:00:05'), foto, estado({ ultimo: envio('2026-11-11T13:30:00') }))).toBe(false);
  });

  it('segunda 14:00:05 sem abertura enviada: não grava (o "lista abriu" ainda vai sair)', () => {
    expect(podeGravarLista(t('2026-11-09T14:00:05'), foto, estado({ ultimo: null, aberturaEnviada: null }))).toBe(false);
  });

  it('rodada comum ou rodada já enviada: grava', () => {
    expect(podeGravarLista(t('2026-11-10T15:30:05'), foto, estado({ ultimo: envio('2026-11-10T15:00:00') }))).toBe(true);
    expect(podeGravarLista(t('2026-11-10T15:40:00'), foto, estado({ ultimo: envio('2026-11-10T15:30:10', foto) }))).toBe(true);
  });
});

describe('responder: mexer na lista pelo nome', () => {
  it.each([
    ['adicionar Pepe', 'adicionar', 'Pepe'],
    ['adicionar lista pepe', 'adicionar', 'pepe'],
    ['confirmar Ana Paula', 'confirmar', 'Ana Paula'],
    ['remover Caio', 'remover', 'Caio'],
  ])('"%s" chama a ação do site e termina com quem pediu', async (texto, acao, nome) => {
    const c = ctx();
    const r = await responder(msg(texto), c);
    expect(c.mexerNaLista).toHaveBeenCalledWith(acao, nome, t('2026-11-10T15:40:00'));
    expect(r).toMatchObject({ texto: 'Pepe entrou na lista. (pedido por Zeca)', ehListaCompleta: false });
    expect(r?.gravar).toBeUndefined();
    expect(c.enviar).toHaveBeenCalledWith('Pepe entrou na lista. (pedido por Zeca)');
  });

  it('sem nome no WhatsApp: "pedido por alguém"; nunca o telefone', async () => {
    const c = ctx();
    const r = await responder(msg('remover Caio', { remetenteNome: null }), c);
    expect(r?.texto).toBe('Pepe entrou na lista. (pedido por alguém)');
    expect(r?.texto).not.toContain(QUALQUER);
    const vazio = await responder(msg('remover Caio', { remetenteNome: '   ' }), ctx());
    expect(vazio?.texto).toBe('Pepe entrou na lista. (pedido por alguém)');
  });

  it('nome comprido demais: "🤔 Nome muito comprido.", sem chamar o site', async () => {
    const c = ctx();
    expect((await responder(msg(`adicionar ${'x'.repeat(100)}`), c))?.texto).toBe('🤔 Nome muito comprido.');
    expect(c.mexerNaLista).not.toHaveBeenCalled();
  });

  it('recusa ou nome não achado (nada mudou): responde sem "pedido por"', async () => {
    const c = ctx({ mexerNaLista: vi.fn(async () => ({ texto: 'A lista está fechada.', mudou: false })) });
    expect((await responder(msg('adicionar Pepe'), c))?.texto).toBe('A lista está fechada.');
  });

  it('qualquer pessoa pode (não precisa ser admin nem ter telefone)', async () => {
    const c = ctx();
    expect((await responder(msg('confirmar Bia', { remetenteTelefone: null }), c))?.texto).toContain('pedido por Zeca');
    expect(c.mexerNaLista).toHaveBeenCalled();
  });

  it('limite de 10 por minuto e silêncio valem igual', async () => {
    const c = ctx();
    for (let i = 0; i < LIMITE_RESPOSTAS; i++) await responder(msg('ajuda'), c);
    expect(await responder(msg('adicionar Pepe'), c)).toBeNull();
    const s = ctx();
    expect(await responder(msg('adicionar Pepe', { quando: t('2026-11-10T23:30:00') }), s)).toBeNull();
    expect(c.mexerNaLista).not.toHaveBeenCalled();
    expect(s.mexerNaLista).not.toHaveBeenCalled();
  });
});

describe('responder: consultas', () => {
  it.each([
    ['artilheiro', 'artilheiro'],
    ['garçom', 'garcom'],
    ['garcom', 'garcom'],
    ['ranking', 'ranking'],
    ['times', 'times'],
  ])('"%s" → consulta %s', async (texto, tipo) => {
    const c = ctx();
    const r = await responder(msg(texto), c);
    expect(c.consultar).toHaveBeenCalledWith(tipo, t('2026-11-10T15:40:00'));
    expect(r?.texto).toBe('⚽ Artilheiros (novembro):\n1. Pepe 5');
    expect(c.perguntar).not.toHaveBeenCalled();
  });
});

describe('responder: comando desconhecido', () => {
  it('sem IA: responde a lista de comandos', async () => {
    const c = ctx({ ia: null });
    expect((await responder(msg('bom dia robô'), c))?.texto).toBe(TEXTO_AJUDA);
    expect(c.perguntar).not.toHaveBeenCalled();
  });

  it('ajuda com IA lembra das perguntas livres; sem IA, não', async () => {
    expect((await responder(msg('ajuda'), ctx({ ia: null })))?.texto).toBe(TEXTO_AJUDA);
    const comIa = (await responder(msg('ajuda'), ctx()))?.texto ?? '';
    expect(comIa.startsWith(TEXTO_AJUDA)).toBe(true);
    expect(comIa).toContain('pergunta');
  });
});

describe('responder: marcação ignorada (log) e aviso do limite', () => {
  const AVISO = '🙏 Muita gente me chamando agora. Mande de novo daqui a pouco.';
  function relogio(inicio: string) {
    let ms = t(inicio).getTime();
    return { agora: () => new Date(ms), andar: (s: number) => (ms += s * 1000) };
  }
  async function encher(c: ReturnType<typeof ctx>, quando: Date) {
    for (let i = 0; i < LIMITE_RESPOSTAS; i++) await responder(msg('ajuda', { quando }), c);
  }
  const linhas = (c: ReturnType<typeof ctx>) => vi.mocked(c.log).mock.calls.map((l) => l[0]);

  it('passou do limite: avisa uma vez e registra no log com o nome, sem telefone', async () => {
    const r = relogio('2026-11-10T15:40:00');
    const c = ctx({}, r.agora);
    await encher(c, r.agora());
    r.andar(12);
    expect(await responder(msg('lista', { quando: r.agora() }), c)).toBeNull();
    expect(c.enviar).toHaveBeenLastCalledWith(AVISO);
    expect(c.lerLista).not.toHaveBeenCalled();
    expect(linhas(c).some((l) => l.startsWith('marcação ignorada (limite de 10 por minuto)') && l.includes('Zeca'))).toBe(true);
    expect(linhas(c).join('\n')).not.toContain(QUALQUER);
  });

  it('no máximo um aviso por 60 s; os outros só vão para o log', async () => {
    const r = relogio('2026-11-10T15:40:00');
    const c = ctx({}, r.agora);
    await encher(c, r.agora());
    r.andar(10);
    await responder(msg('lista', { quando: r.agora() }), c);
    r.andar(10);
    await responder(msg('lista', { quando: r.agora() }), c);
    expect(vi.mocked(c.enviar).mock.calls.filter((x) => x[0] === AVISO)).toHaveLength(1);
    expect(linhas(c).filter((l) => l.startsWith('marcação ignorada (limite de 10 por minuto)'))).toHaveLength(2);
  });

  it('o aviso não conta nas 10: 60 s depois das respostas volta a responder', async () => {
    const r = relogio('2026-11-10T15:40:00');
    const c = ctx({}, r.agora);
    await encher(c, r.agora());
    r.andar(50);
    await responder(msg('fila', { quando: r.agora() }), c); // aviso aos 50 s
    r.andar(10);
    expect((await responder(msg('fila', { quando: r.agora() }), c))?.texto).toBe('📝 Fila:\n1. Caio');
  });

  it('aviso que não sai: registra no log e não conta como aviso', async () => {
    const r = relogio('2026-11-10T15:40:00');
    let falhar = false;
    const c = ctx({ enviar: vi.fn(async () => (falhar ? Promise.reject(new Error('sem rede')) : undefined)) }, r.agora);
    await encher(c, r.agora());
    falhar = true;
    r.andar(5);
    await responder(msg('lista', { quando: r.agora() }), c);
    falhar = false;
    r.andar(5);
    await responder(msg('lista', { quando: r.agora() }), c);
    expect(c.enviar).toHaveBeenLastCalledWith(AVISO);
    expect(linhas(c).some((l) => l.includes('sem rede'))).toBe(true);
  });

  it('silêncio, outro grupo e citação sem comando: registra o motivo no log', async () => {
    const c = ctx();
    await responder(msg('lista', { quando: t('2026-11-10T23:30:00') }), c);
    await responder(msg('lista', { grupoId: 'outro@g.us' }), c);
    await responder(msg('legal', { mencionaORobo: false, respondeAoRobo: true }), c);
    expect(linhas(c).some((l) => l.startsWith('marcação ignorada (silêncio 23–08)'))).toBe(true);
    expect(linhas(c).some((l) => l.startsWith('marcação ignorada (outro grupo)'))).toBe(true);
    expect(linhas(c).some((l) => l.startsWith('marcação ignorada (resposta ao robô sem comando reconhecido)'))).toBe(true);
    expect(c.enviar).not.toHaveBeenCalled();
  });

  it('mensagem comum do grupo (sem marcar nem citar o robô): nem log', async () => {
    const c = ctx();
    await responder(msg('bora jogar', { mencionaORobo: false }), c);
    expect(c.log).not.toHaveBeenCalled();
  });
});

describe('responder: brincadeira com o calvinho (quem pede é o Jonas)', () => {
  const JONAS = '5581990000007'; // fictício
  const PREFIXOS: Record<string, string[]> = {
    lista: ['😎 Pra você, calvinho, a lista brilhando igual sua cabeça:', '📋 Aqui, calvo! Lista fresquinha:', '✨ Saindo a lista pro meu calvinho favorito:'],
    'falta confirmar': ['🕵️ Fiscalizando pro calvinho:', '⏳ O calvinho quer saber quem tá enrolando:'],
    fila: ['📝 O calvinho de olho na fila:', '📝 Fila pro meu calvo favorito:'],
    times: ['👕 Se prepara, calvinho, os times são esses:', '👕 Já passa o protetor, calvo! Os times de hoje:'],
    artilheiro: ['⚽ Os goleadores pro calvinho conferir:', '⚽ Olha quem tá balançando a rede, calvo:'],
    garçom: ['🎯 Os garçons da pelada, calvinho:', '🎯 Quem mais deu passe, calvo:'],
    ranking: ['🏆 O ranking pro meu calvinho favorito:', '🏆 Será que o calvo tá no pódio? Confere:'],
    ajuda: ['🤖 Fala, calvinho! Os comandos são esses:'],
  };
  const doJonas = (texto: string, over: Partial<MensagemRecebida> = {}) => msg(texto, { remetenteTelefone: JONAS, remetenteNome: 'Jonas', ...over });
  const consultaTimes = async () => '👕 Times de hoje:\n\n🔵 Azul\n- Ana';

  it.each(Object.keys(PREFIXOS))('%s: uma das variantes, uma linha antes do texto normal', async (comando) => {
    for (const rng of [() => 0, () => 0.999]) {
      const normal = ctx({ ia: null, ...(comando === 'times' ? { consultar: consultaTimes } : {}) });
      const esperado = (await responder(msg(comando), normal))!.texto;
      const c = ctx({ ia: null, calvinho: [JONAS], rng, ...(comando === 'times' ? { consultar: consultaTimes } : {}) });
      const r = (await responder(doJonas(comando), c))!;
      const [primeira, ...resto] = r.texto.split('\n');
      expect(PREFIXOS[comando]).toContain(primeira);
      expect(resto.join('\n')).toBe(esperado);
    }
  });

  it('quem não é o Jonas não ganha linha nenhuma', async () => {
    const c = ctx({ ia: null, calvinho: [JONAS], rng: () => 0 });
    const r = (await responder(msg('fila', { remetenteNome: 'Jonas' }), c))!;
    expect(r.texto).toBe(`📝 Fila:\n1. Caio`);
    expect(r.texto).not.toContain('calvinho');
  });

  it('sem número configurado ou sem telefone: vale o primeiro nome do WhatsApp', async () => {
    const semConfig = ctx({ ia: null, rng: () => 0 });
    expect((await responder(msg('fila', { remetenteNome: 'Jonas Silva' }), semConfig))!.texto.startsWith(PREFIXOS.fila[0])).toBe(true);
    const lid = ctx({ ia: null, calvinho: [JONAS], rng: () => 0 });
    expect((await responder(msg('fila', { remetenteTelefone: null, remetenteNome: 'jonas' }), lid))!.texto.startsWith(PREFIXOS.fila[0])).toBe(true);
    expect((await responder(msg('fila', { remetenteTelefone: null, remetenteNome: 'Maria Jonas' }), lid))!.texto).not.toContain('calvinho');
  });

  it('sortear: linha só com proposta; erro continua sério', async () => {
    const c = ctx({ calvinho: [JONAS], admins: [JONAS], rng: () => 0 });
    expect((await responder(doJonas('sortear'), c))!.texto).toBe('🍀 Sorteando com a sorte do calvinho:\nTimes propostos');
    const erro = ctx({ calvinho: [JONAS], admins: [JONAS], propor: vi.fn(async () => ({ erro: '👥 Poucos confirmados para sortear.' })) });
    expect((await responder(doJonas('sortear'), erro))!.texto).toBe('👥 Poucos confirmados para sortear.');
    const naoAdmin = ctx({ calvinho: [JONAS] });
    expect((await responder(doJonas('sortear'), naoAdmin))!.texto).toBe(TEXTO_SO_ADMIN);
  });

  it('sim: texto salvo do calvinho; erro continua sério', async () => {
    const c = ctx({ calvinho: [JONAS], admins: [JONAS], proposta: { atual: proposta({ adminTelefone: JONAS }) } });
    expect((await responder(doJonas('sim'), c))!.texto).toBe('🏆 Times definitivos salvos! Valeu, calvinho 😎');
    const erro = ctx({ calvinho: [JONAS], proposta: { atual: proposta({ adminTelefone: JONAS }) }, confirmar: vi.fn(async () => ({ erro: '⌛ A proposta expirou. Peça *sortear* de novo.' })) });
    expect((await responder(doJonas('sim'), erro))!.texto).toBe('⌛ A proposta expirou. Peça *sortear* de novo.');
  });

  it('texto desconhecido sem IA: "não entendi" + ajuda; com IA, só a resposta da IA', async () => {
    const semIa = ctx({ ia: null, calvinho: [JONAS] });
    expect((await responder(doJonas('bora jogar'), semIa))!.texto).toBe(`🤔 Não entendi, calvinho. Os comandos são esses:\n${TEXTO_AJUDA}`);
    const comIa = ctx({ calvinho: [JONAS] });
    expect((await responder(doJonas('o João está na lista?'), comIa))!.texto).toBe('O João está na lista.');
  });

  it('adicionar/confirmar/remover: sem linha extra (a brincadeira do objeto vem do texto da lista)', async () => {
    const c = ctx({ calvinho: [JONAS], rng: () => 0 });
    expect((await responder(doJonas('confirmar Pepe'), c))!.texto).toBe('Pepe entrou na lista. (pedido por Jonas)');
  });

  it('erro de consulta ou "sem times" fica sério', async () => {
    const c = ctx({ ia: null, calvinho: [JONAS], consultar: vi.fn(async () => '👕 Os times de hoje ainda não foram sorteados.') });
    expect((await responder(doJonas('times'), c))!.texto).toBe('👕 Os times de hoje ainda não foram sorteados.');
  });

  it('calvinhoDoEnv lê números separados por vírgula; ausente = vazio', () => {
    expect(calvinhoDoEnv({ ROBO_CALVINHO: ' 5581990000007 ,' })).toEqual(['5581990000007']);
    expect(calvinhoDoEnv({})).toEqual([]);
  });

  it('nenhuma variante do Jonas usa a palavra "careca"', () => {
    const todas = [...Object.values(PREFIXOS_CALVINHO).flat(), PREFIXO_NAO_ENTENDI, SALVO_CALVINHO, ...Object.values(CALVINHO).flat()];
    expect(todas.length).toBeGreaterThan(25);
    for (const v of todas) expect(v!.toLowerCase()).not.toContain('careca');
  });
});
