import { describe, expect, it, vi } from 'vitest';
import type { EstadoDaSemana } from '@/server/presencas';
import type { Envio } from '@/robo/agenda';
import { TEXTO_AJUDA } from '@/robo/comandos';
import { fotografar } from '@/robo/foto';
import { Freio, LIMITE_PERGUNTAS, TEXTO_LIMITE } from '@/robo/freio';
import { configDasRespostas, responder, type ContextoDaResposta, type MensagemRecebida } from '@/robo/responder';
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
  return { grupoId: GRUPO, remetenteTelefone: QUALQUER, texto, mencionaORobo: true, quando: t('2026-11-10T15:40:00'), ...over };
}

function proposta(over: Partial<Proposta> = {}): Proposta {
  return { adminTelefone: ADMIN, criadaEm: t('2026-11-11T15:00:00'), peladaId: 1, elencos: [[1], [2]], completes: [[], []], texto: 'Times propostos', ...over };
}

function ctx(over: Partial<ContextoDaResposta> = {}, relogio = () => t('2026-11-10T15:40:00')) {
  const c = {
    estadoGrupoId: GRUPO,
    freio: new Freio(relogio),
    admins: [ADMIN, OUTRO_ADMIN],
    ia: { chave: 'chave-falsa', modelo: 'modelo/falso' },
    ultimo: null as Envio | null,
    proposta: { atual: null as Proposta | null },
    lerLista: vi.fn(async () => lista),
    propor: vi.fn(async (now: Date, tel: string) => proposta({ adminTelefone: tel, criadaEm: now })),
    confirmar: vi.fn(async (): Promise<{ ok: string } | { erro: string }> => ({ ok: 'Times definitivos salvos.' })),
    perguntar: vi.fn(async () => 'O João está na lista.'),
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

  it('freio: segunda marcação no mesmo minuto não responde e não registra resposta', async () => {
    const c = ctx();
    await responder(msg('ajuda'), c);
    const registrar = vi.spyOn(c.freio, 'registrarResposta');
    expect(await responder(msg('fila'), c)).toBeNull();
    expect(registrar).not.toHaveBeenCalled();
    expect(c.enviar).toHaveBeenCalledTimes(1);
  });

  it('registra a resposta só depois de enviar; envio que falha é registrado no log e não conta', async () => {
    const c = ctx();
    const registrar = vi.spyOn(c.freio, 'registrarResposta');
    await responder(msg('ajuda'), c);
    expect(c.enviar).toHaveBeenCalledWith(TEXTO_AJUDA);
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
    expect((await responder(msg('ajuda'), ctx()))?.texto).toBe(TEXTO_AJUDA);
    expect((await responder(msg('falta confirmar'), ctx()))?.texto).toBe('Ainda não confirmaram: Bia.');
    expect((await responder(msg('fila'), ctx()))?.texto).toBe('Fila:\n1. Caio');
  });

  it('respostas que não são a lista completa não marcam ehListaCompleta', async () => {
    const r = await responder(msg('fila'), ctx());
    expect(r?.ehListaCompleta).toBe(false);
  });
});

describe('responder: lista', () => {
  const ultimoSemMudanca: Envio = { quando: t('2026-11-10T15:30:10').toISOString(), rodada: t('2026-11-10T15:30:00').toISOString(), tipo: 'rodada', foto: fotografar(lista) };

  it('sem mudança desde a última mensagem do robô: frase curta com a hora dela', async () => {
    const c = ctx({ ultimo: ultimoSemMudanca });
    const r = await responder(msg('lista'), c);
    expect(r).toMatchObject({ texto: 'A lista não mudou desde as 15:30.', ehListaCompleta: false });
    expect(c.enviar).toHaveBeenCalledWith('A lista não mudou desde as 15:30.');
  });

  it('marcação sem texto também é a lista', async () => {
    const r = await responder(msg(''), ctx({ ultimo: ultimoSemMudanca }));
    expect(r?.texto).toBe('A lista não mudou desde as 15:30.');
  });

  it('com mudança: cabeçalho + lista completa, marca ehListaCompleta com a foto para gravar', async () => {
    const antes = fotografar({ ...lista, fila: [] });
    const c = ctx({ ultimo: { ...ultimoSemMudanca, foto: antes } });
    const r = await responder(msg('lista'), c);
    expect(r?.ehListaCompleta).toBe(true);
    expect(r?.texto.split('\n')[0]).toBe('Entraram na fila: Caio.');
    expect(r?.texto).toContain('Ana');
    expect(r?.texto).toContain('Caio');
    expect(r?.gravar).toEqual({ tipo: 'rodada', foto: fotografar(lista) });
  });

  it('sem mensagem anterior da semana: lista completa com o título da semana', async () => {
    const c = ctx({ ultimo: { ...ultimoSemMudanca, foto: { ...fotografar(lista), dataQuarta: '2026-11-04' } } });
    const r = await responder(msg('lista'), c);
    expect(r?.texto.startsWith('Lista de quarta, 11/11:')).toBe(true);
    expect(r).toMatchObject({ ehListaCompleta: true, gravar: { tipo: 'primeira' } });
  });

  it('fora da janela (sábado): responde a lista, mas não vira a última lista das rodadas', async () => {
    const c = ctx({}, () => t('2026-11-14T10:00:00'));
    const r = await responder(msg('lista', { quando: t('2026-11-14T10:00:00') }), c);
    expect(c.enviar).toHaveBeenCalledTimes(1);
    expect(r?.texto).toContain('Ana');
    expect(r).toMatchObject({ ehListaCompleta: false });
    expect(r?.gravar).toBeUndefined();
    expect(c.lerLista).toHaveBeenCalledWith(t('2026-11-14T10:00:00'));
  });

  it('pelada cancelada desde a última mensagem: avisa o cancelamento e grava como cancelada', async () => {
    const c = ctx({ ultimo: ultimoSemMudanca, lerLista: vi.fn(async () => ({ ...lista, estadoManual: 'cancelada' as const })) });
    const r = await responder(msg('lista'), c);
    expect(r?.texto).toBe('A pelada de quarta, 11/11 foi cancelada.');
    expect(r?.gravar?.tipo).toBe('cancelada');
  });
});

describe('responder: pergunta livre', () => {
  it('sem chave ou sem modelo: perguntas livres desligadas', async () => {
    const c = ctx({ ia: null });
    expect((await responder(msg('quem é o artilheiro?'), c))?.texto).toBe('As perguntas livres não estão ligadas.');
    expect(c.perguntar).not.toHaveBeenCalled();
  });

  it('pergunta à IA com o relógio e conta a pergunta', async () => {
    const c = ctx();
    const registrar = vi.spyOn(c.freio, 'registrarPergunta');
    const r = await responder(msg('o João está na lista?'), c);
    expect(r).toMatchObject({ texto: 'O João está na lista.', ehListaCompleta: false });
    expect(c.perguntar).toHaveBeenCalledWith('o João está na lista?', expect.objectContaining({ agora: expect.any(Function) }));
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
    const c = ctx({ propor: vi.fn(async () => ({ erro: 'Hoje não tem pelada para sortear.' })) }, relogio.agora);
    expect((await passo('sortear', c, ADMIN))?.texto).toBe('Hoje não tem pelada para sortear.');
    expect(c.proposta.atual).toBeNull();
  });

  it('"sim" confirma a proposta guardada e a apaga; o segundo "sim" não tem o que confirmar', async () => {
    const c = ctx({}, relogio.agora);
    await passo('sortear', c, ADMIN);
    const guardada = c.proposta.atual;
    expect((await passo('sim', c, ADMIN))?.texto).toBe('Times definitivos salvos.');
    expect(c.confirmar).toHaveBeenCalledWith(expect.any(Date), ADMIN, guardada);
    expect(c.proposta.atual).toBeNull();
    expect((await passo('sim', c, ADMIN))?.texto).toBe('Não tem sorteio esperando confirmação.');
    expect(c.confirmar).toHaveBeenCalledTimes(1);
  });

  it('"sim" de outra pessoa: não apaga a proposta (quem pediu ainda pode confirmar)', async () => {
    const c = ctx({ confirmar: vi.fn(async () => ({ erro: 'Só quem pediu o sorteio pode confirmar.' })) }, relogio.agora);
    await passo('sortear', c, ADMIN);
    expect((await passo('sim', c, QUALQUER))?.texto).toBe('Só quem pediu o sorteio pode confirmar.');
    expect(c.proposta.atual).not.toBeNull();
  });

  it('proposta expirada: responde a expiração e apaga; o "sim" seguinte não tem o que confirmar', async () => {
    const c = ctx({ confirmar: vi.fn(async () => ({ erro: 'A proposta expirou. Peça *sortear* de novo.' })) }, relogio.agora);
    c.proposta.atual = proposta({ criadaEm: new Date(relogio.agora().getTime() - 20 * 60_000) });
    expect((await passo('sim', c, ADMIN))?.texto).toBe('A proposta expirou. Peça *sortear* de novo.');
    expect(c.proposta.atual).toBeNull();
    expect((await passo('sim', c, ADMIN))?.texto).toBe('Não tem sorteio esperando confirmação.');
  });

  it('"sim" de quem não é admin, sem proposta: não tem o que confirmar', async () => {
    const c = ctx({}, relogio.agora);
    expect((await passo('sim', c, QUALQUER))?.texto).toBe('Não tem sorteio esperando confirmação.');
    expect(c.confirmar).not.toHaveBeenCalled();
  });

  it('pedido de sorteio como pergunta livre vai para a IA, nunca para o sorteio', async () => {
    const c = ctx({}, relogio.agora);
    await passo('sorteia os times aí', c, ADMIN);
    expect(c.propor).not.toHaveBeenCalled();
    expect(c.perguntar).toHaveBeenCalled();
  });
});

describe('configDasRespostas (.env)', () => {
  it('chave e modelo ligam as perguntas; admins separados por vírgula', () => {
    expect(configDasRespostas({ OPENROUTER_API_KEY: ' k ', OPENROUTER_MODEL: 'm/x', ROBO_ADMINS: `${ADMIN}, ${OUTRO_ADMIN} ,` })).toEqual({
      ia: { chave: 'k', modelo: 'm/x' },
      admins: [ADMIN, OUTRO_ADMIN],
    });
  });

  it('sem chave ou sem modelo: perguntas desligadas; sem admins: lista vazia', () => {
    expect(configDasRespostas({ OPENROUTER_MODEL: 'm/x' })).toEqual({ ia: null, admins: [] });
    expect(configDasRespostas({ OPENROUTER_API_KEY: 'k', OPENROUTER_MODEL: '  ' })).toEqual({ ia: null, admins: [] });
  });
});
