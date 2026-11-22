import { describe, expect, it, vi } from 'vitest';
import { ERRO_IA } from '@/robo/ia';
import { EnvioIncerto, ErroDeLimite } from '@/robo/limite';
import { textoWhatsApp } from '@/domain/copiarLista';
import type { EstadoDaSemana } from '@/server/presencas';
import type { Envio, EstadoDoRobo } from '@/robo/agenda';
import { TEXTO_AJUDA, TEXTO_AJUDA_PERGUNTA, TEXTO_AJUDA_PRIVADO, TEXTO_AJUDA_PRIVADO_IA, TEXTO_SO_3_OU_4, type AcaoNaLista } from '@/robo/comandos';
import { fotografar } from '@/robo/foto';
import { Freio, LIMITE_PERGUNTAS, LIMITE_RESPOSTAS, TEXTO_LIMITE } from '@/robo/freio';
import {
  TEXTO_IMPORTAR_NO_PRIVADO,
  PERGUNTA_MANDAR,
  TEXTO_MANDADOS,
  TEXTO_MANDAR_NO_PRIVADO,
  TEXTO_SEM_ANUNCIO,
  TEXTO_PROPOSTA_VENCIDA,
  TEXTO_SALVOS,
  TEXTO_SEM_PROPOSTA,
  TEXTO_SO_ADMIN_CONFIRMA,
  TEXTO_SO_ADMIN_IMPORTAR,
  TEXTO_TIMES_INDEFINIDOS,
} from '@/robo/responder';
import { apelidosDoEnv, calvinhoDoEnv, ferramentasDoOrganizador, perguntaPendentes, TEXTO_LISTA_MANDADA, lerTrocas, TEXTO_NADA_PARA_DESFAZER, TEXTO_SEM_TIMES_PARA_TROCAR, TEXTO_SO_ADMIN_ANOTAR, ferramentasDeAcao, PREFIXO_NAO_ENTENDI, PREFIXOS_CALVINHO, SALVOS_CALVINHO, configDasRespostas, podeGravarLista, responder, type ContextoDaResposta, type MensagemRecebida } from '@/robo/responder';
import { CALVINHO } from '@/robo/lista-zap';
import { ConversasPrivadas } from '@/robo/conversa-privada';
import { ErroDeFerramenta, TextoPronto } from '@/robo/ferramentas';
import { INSTRUCOES_VOTO, montarProposta, TEXTO_SO_ADMIN, type AnuncioPendente, type Proposta, type TimesPropostos } from '@/robo/sorteio-zap';
import { TEXTO_MAX_CADASTROS, TEXTO_SO_ADMIN_CADASTRO } from '@/robo/cadastro-zap';

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

const LISTA = textoWhatsApp(lista, lista.data);

function msg(texto: string, over: Partial<MensagemRecebida> = {}): MensagemRecebida {
  return { grupoId: GRUPO, remetenteTelefone: QUALQUER, remetenteNome: 'Zeca', texto, mencionaORobo: true, respondeAoRobo: false, quando: t('2026-11-10T15:40:00'), ...over };
}

const TIMES: TimesPropostos = {
  peladaId: 1,
  times: [
    { jogadores: [{ id: 1, nome: 'Ana', nota: 3 }], completes: [], soma: 3 },
    { jogadores: [{ id: 2, nome: 'Bia', nota: 2.5 }], completes: [], soma: 2.5 },
  ],
};
const BLOCOS = '🔵 Azul (3,0)\n- Ana 3,0\n\n🟠 Laranja (2,5)\n- Bia 2,5\n\nDiferença: 0,5';
const textoProposta = (nome = 'Zeca', origem: 'sorteio' | 'importado' = 'sorteio') =>
  `${origem === 'sorteio' ? '🎲 Times sorteados' : '📥 Times importados'} por ${nome}:\n\n${BLOCOS}\n\n${INSTRUCOES_VOTO}`;

function proposta(over: Partial<Proposta> = {}): Proposta {
  return { ...montarProposta('sorteio', { telefone: ADMIN, nome: 'Zeca' }, t('2026-11-11T15:00:00'), TIMES), ...over };
}

function ctx(over: Partial<ContextoDaResposta> = {}, relogio = () => t('2026-11-10T15:40:00')) {
  const c = {
    estadoGrupoId: GRUPO,
    freio: new Freio(relogio),
    admins: [ADMIN, OUTRO_ADMIN],
    ia: { chave: 'chave-falsa', modelo: 'claude-haiku-5-5' },
    ultimo: null as Envio | null,
    proposta: { atual: null as Proposta | null },
    anuncio: { atual: null as AnuncioPendente | null },
    lerLista: vi.fn(async () => lista),
    propor: vi.fn(async (): Promise<TimesPropostos | { erro: string }> => TIMES),
    importar: vi.fn(async (): Promise<TimesPropostos | { erro: string }> => TIMES),
    salvar: vi.fn(async (): Promise<{ ok: true } | { erro: string }> => ({ ok: true })),
    avisarOrganizadores: vi.fn(async () => {}),
    anunciarNoGrupo: vi.fn(async () => {}),
    perguntar: vi.fn(async () => 'O João está na lista.'),
    mexerNaLista: vi.fn(async (): Promise<{ texto: string; mudou: boolean }> => ({ texto: 'Pepe entrou na lista.', mudou: true })),
    consultar: vi.fn(async () => '⚽ Artilheiros (novembro):\n1. Pepe 5'),
    cadastrar: vi.fn(async (): Promise<{ texto: string; mudou: boolean }> => ({ texto: '✅ Cadastrado: Caio (2,5).', mudou: true })),
    linkAnotar: vi.fn(async (): Promise<{ url: string; data?: string } | { erro: string }> => ({ url: 'https://pelada.exemplo/anotar/CHAVE', data: '2026-11-18' })),
    notas: vi.fn(async () => '📋 Notas (2 jogadores):\nAna 3,0\nBia 2,5'),
    mudarNota: vi.fn(async (): Promise<{ texto: string; mudou: boolean }> => ({ texto: '✅ Nota de Ana: 3,0 → 3,5.', mudou: true })),
    urlSite: 'https://pelada.exemplo',
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

describe('responder: sorteio com 2 de 3', () => {
  // Cada passo um minuto depois, para o freio deixar responder.
  const relogio = (() => {
    let n = 0;
    return { agora: () => new Date(t('2026-11-11T15:00:00').getTime() + n * 60_000), andar: () => n++ };
  })();
  const passo = (texto: string, c: ReturnType<typeof ctx>, tel: string | null, over: Partial<MensagemRecebida> = {}) => {
    relogio.andar();
    return responder(msg(texto, { remetenteTelefone: tel, quando: relogio.agora(), ...over }), c);
  };
  const noPrivado = (tel: string, nome: string) => ({ privado: true, grupoId: `${tel}@s.whatsapp.net`, mencionaORobo: false, remetenteNome: nome });

  it('quem não é admin (ou sem telefone) recebe o aviso, sem propor', async () => {
    const c = ctx({}, relogio.agora);
    expect((await passo('sortear', c, QUALQUER))?.texto).toBe(TEXTO_SO_ADMIN);
    expect((await passo('sortear', c, null))?.texto).toBe(TEXTO_SO_ADMIN);
    expect(c.propor).not.toHaveBeenCalled();
    expect(c.proposta.atual).toBeNull();
  });

  it('"sortear 3 times" propõe em 3; "sortear" em 4; "sortear 5 times" recusa sem propor', async () => {
    const c = ctx({}, relogio.agora);
    await passo('sortear 3 times', c, ADMIN);
    expect(c.propor).toHaveBeenLastCalledWith(expect.any(Date), 3, false);
    await passo('sortear', c, ADMIN);
    expect(c.propor).toHaveBeenLastCalledWith(expect.any(Date), 4, false);
    expect((await passo('sortear 5 times', c, ADMIN))?.texto).toBe(TEXTO_SO_3_OU_4);
    expect(c.propor).toHaveBeenCalledTimes(2);
  });

  it('no grupo: a proposta aparece no grupo, mas os outros organizadores só recebem quando quem sorteou aprovar; a nova substitui a antiga', async () => {
    const c = ctx({}, relogio.agora);
    expect((await passo('sortear', c, ADMIN))?.texto).toBe(textoProposta());
    expect(c.avisarOrganizadores).not.toHaveBeenCalled();
    expect(c.proposta.atual).toMatchObject({ origem: 'sorteio', quemPropos: ADMIN, votos: [] });
    await passo('sim', c, ADMIN);
    expect(c.proposta.atual?.votos).toEqual([ADMIN]);
    await passo('sorteia', c, OUTRO_ADMIN);
    expect(c.proposta.atual).toMatchObject({ quemPropos: OUTRO_ADMIN, votos: [] });
  });

  it('erro ao propor: responde o erro e não guarda nada', async () => {
    const c = ctx({ propor: vi.fn(async () => ({ erro: '📅 Hoje não tem pelada para sortear.' })) }, relogio.agora);
    expect((await passo('sortear', c, ADMIN))?.texto).toBe('📅 Hoje não tem pelada para sortear.');
    expect(c.proposta.atual).toBeNull();
    expect(c.avisarOrganizadores).not.toHaveBeenCalled();
  });

  it('no privado: 1º sim de quem sorteou conta e avisa os outros; 2º sim de outro organizador salva, NÃO manda no grupo e pergunta a quem sorteou', async () => {
    const c = ctx({}, relogio.agora);
    expect((await passo('sortear', c, ADMIN, noPrivado(ADMIN, 'Marco')))?.texto).toBe(textoProposta('Marco'));
    expect(c.avisarOrganizadores).not.toHaveBeenCalled();
    expect((await passo('sim', c, ADMIN, noPrivado(ADMIN, 'Marco')))?.texto).toBe('✅ Aprovado! Mandei para os outros organizadores; falta 1 confirmar.');
    expect(c.avisarOrganizadores).toHaveBeenLastCalledWith(
      `✅ Marco aprovou estes times. Responda *sim* para confirmar: com o seu, eles ficam salvos no site.\n\n🎲 Times sorteados por Marco:\n\n${BLOCOS}`,
      [ADMIN],
    );
    expect((await passo('sim', c, ADMIN, noPrivado(ADMIN, 'Marco')))?.texto).toBe('👍 Você já confirmou. Falta 1 organizador confirmar.');
    expect(c.salvar).not.toHaveBeenCalled();

    const guardada = c.proposta.atual;
    expect((await passo('sim', c, OUTRO_ADMIN, noPrivado(OUTRO_ADMIN, 'Pepe')))?.texto).toBe(`${TEXTO_SALVOS}\nMarco decide quando mandar no grupo.`);
    expect(c.salvar).toHaveBeenCalledWith(expect.any(Date), { ...guardada, votos: [ADMIN, OUTRO_ADMIN] });
    expect(c.anunciarNoGrupo).not.toHaveBeenCalled();
    // Só quem sorteou recebe a pergunta (todos os outros ficam no `exceto`).
    expect(c.avisarOrganizadores).toHaveBeenLastCalledWith(`🏆 Pepe confirmou e os times estão salvos no site.\n${PERGUNTA_MANDAR}`, [OUTRO_ADMIN]);
    expect(c.anuncio.atual).toMatchObject({ texto: `🏆 Times da noite:\n\n${BLOCOS}`, quemPropos: ADMIN });
    expect(c.proposta.atual).toBeNull();
    expect((await passo('sim', c, ADMIN, noPrivado(ADMIN, 'Marco')))?.texto).toBe(TEXTO_SEM_PROPOSTA);
  });

  it('2º sim no grupo: salva, mas o grupo não recebe os times; quem sorteou recebe a pergunta no privado', async () => {
    const c = ctx({}, relogio.agora);
    await passo('sortear', c, ADMIN);
    await passo('sim', c, ADMIN);
    const r = await passo('sim', c, OUTRO_ADMIN, { remetenteNome: 'Pepe' });
    expect(r?.texto).toBe(`${TEXTO_SALVOS}\nZeca decide quando mandar no grupo.`);
    expect(r?.texto).not.toContain('Azul');
    expect(c.anunciarNoGrupo).not.toHaveBeenCalled();
  });

  it('outro organizador dá sim antes de quem sorteou aprovar: não conta e ele fica sabendo que precisa esperar', async () => {
    const c = ctx({}, relogio.agora);
    await passo('sortear', c, ADMIN, noPrivado(ADMIN, 'Marco'));
    expect((await passo('sim', c, OUTRO_ADMIN, noPrivado(OUTRO_ADMIN, 'Pepe')))?.texto).toBe('⏳ Marco ainda não aprovou esses times. Quando aprovar, eu te mando para confirmar.');
    expect(c.proposta.atual?.votos).toEqual([]);
    expect(c.salvar).not.toHaveBeenCalled();
  });

  it('com 3 organizadores, no 2º sim o terceiro só é avisado de que está salvo', async () => {
    const c = ctx({ admins: [ADMIN, OUTRO_ADMIN, QUALQUER] }, relogio.agora);
    await passo('sortear', c, ADMIN, noPrivado(ADMIN, 'Marco'));
    await passo('sim', c, ADMIN, noPrivado(ADMIN, 'Marco'));
    await passo('sim', c, OUTRO_ADMIN, noPrivado(OUTRO_ADMIN, 'Pepe'));
    expect(c.avisarOrganizadores).toHaveBeenLastCalledWith('🏆 Times confirmados e salvos no site. Marco decide quando mandar no grupo.', [ADMIN, OUTRO_ADMIN]);
  });

  it('mandar: só quem sorteou, só no privado; aí os times vão ao grupo e os outros são avisados', async () => {
    const c = ctx({}, relogio.agora);
    await passo('sortear', c, ADMIN, noPrivado(ADMIN, 'Marco'));
    await passo('sim', c, ADMIN, noPrivado(ADMIN, 'Marco'));
    await passo('sim', c, OUTRO_ADMIN, noPrivado(OUTRO_ADMIN, 'Pepe'));
    expect((await passo('mandar', c, OUTRO_ADMIN, noPrivado(OUTRO_ADMIN, 'Pepe')))?.texto).toBe('🔐 Só Marco, que propôs os times, manda no grupo.');
    expect((await passo('mandar', c, ADMIN))?.texto).toBe(TEXTO_MANDAR_NO_PRIVADO);
    expect(c.anunciarNoGrupo).not.toHaveBeenCalled();
    expect((await passo('pode mandar', c, ADMIN, noPrivado(ADMIN, 'Marco')))?.texto).toBe(TEXTO_MANDADOS);
    expect(c.anunciarNoGrupo).toHaveBeenCalledWith(`🏆 Times da noite:\n\n${BLOCOS}`);
    expect(c.avisarOrganizadores).toHaveBeenLastCalledWith('📣 Marco mandou os times no grupo.', [ADMIN]);
    expect(c.anuncio.atual).toBeNull();
    expect((await passo('mandar', c, ADMIN, noPrivado(ADMIN, 'Marco')))?.texto).toBe(TEXTO_SEM_ANUNCIO);
  });

  it('enquanto os times salvos esperam o mandar, "times" no grupo não mostra nada; no privado mostra; um sortear novo descarta', async () => {
    const c = ctx({ consultar: vi.fn(async () => '👕 Times de quarta, 11/11:') }, relogio.agora);
    c.anuncio.atual = { texto: '🏆 Times da noite:\n\nX', quemPropos: ADMIN, quemProposNome: 'Marco', peladaId: 1, criadoEm: relogio.agora() };
    expect((await passo('times', c, QUALQUER))?.texto).toBe(TEXTO_TIMES_INDEFINIDOS);
    expect((await passo('times', c, OUTRO_ADMIN, noPrivado(OUTRO_ADMIN, 'Pepe')))?.texto).toBe('✅ Times salvos, esperando Marco mandar no grupo:\n\n🏆 Times da noite:\n\nX');
    await passo('sortear', c, ADMIN);
    expect(c.anuncio.atual).toBeNull();
  });

  it('falha ao mandar no grupo: avisa e deixa tentar de novo', async () => {
    const c = ctx({ anunciarNoGrupo: vi.fn(async () => { throw new Error('caiu'); }) }, relogio.agora);
    c.anuncio.atual = { texto: 'T', quemPropos: ADMIN, quemProposNome: 'Marco', peladaId: 1, criadoEm: relogio.agora() };
    expect((await passo('mandar', c, ADMIN, noPrivado(ADMIN, 'Marco')))?.texto).toBe('😕 Não consegui mandar no grupo agora. Tente *mandar* de novo daqui a pouco.');
    expect(c.anuncio.atual).not.toBeNull();
  });

  it('o site recusa ao salvar: a proposta acaba e todos recebem o motivo', async () => {
    const c = ctx({ salvar: vi.fn(async () => ({ erro: '🔄 A lista mudou desde o sorteio. Peça *sortear* de novo.' })) }, relogio.agora);
    await passo('sortear', c, ADMIN);
    await passo('sim', c, ADMIN);
    const esperado = '🔄 A lista mudou desde o sorteio. Peça *sortear* de novo.\nOs times não foram salvos.';
    expect((await passo('sim', c, OUTRO_ADMIN))?.texto).toBe(esperado);
    expect(c.avisarOrganizadores).toHaveBeenLastCalledWith(esperado, [OUTRO_ADMIN]);
    expect(c.proposta.atual).toBeNull();
    expect(c.anunciarNoGrupo).not.toHaveBeenCalled();
  });

  it('"sim" de quem não é organizador não conta; sem proposta, não tem o que confirmar', async () => {
    const c = ctx({}, relogio.agora);
    expect((await passo('sim', c, QUALQUER))?.texto).toBe(TEXTO_SEM_PROPOSTA);
    await passo('sortear', c, ADMIN);
    expect((await passo('sim', c, QUALQUER))?.texto).toBe(TEXTO_SO_ADMIN_CONFIRMA);
    expect((await passo('sim', c, null))?.texto).toBe(TEXTO_SO_ADMIN_CONFIRMA);
    expect(c.proposta.atual?.votos).toEqual([]);
  });

  it('proposta com 60 minutos: vence e acaba', async () => {
    const c = ctx({}, relogio.agora);
    relogio.andar();
    c.proposta.atual = proposta({ criadaEm: new Date(relogio.agora().getTime() - 60 * 60_000) });
    expect((await passo('sim', c, ADMIN))?.texto).toBe(TEXTO_PROPOSTA_VENCIDA);
    expect(c.proposta.atual).toBeNull();
  });

  it('com o limite de respostas cheio: o "sim" de organizador passa; o de outra pessoa é barrado', async () => {
    const c = ctx({}, relogio.agora);
    relogio.andar();
    const quando = relogio.agora();
    await responder(msg('sortear', { remetenteTelefone: ADMIN, quando }), c);
    for (let i = 1; i < LIMITE_RESPOSTAS; i++) await responder(msg('fila', { quando }), c);
    expect(await responder(msg('sim', { remetenteTelefone: QUALQUER, quando }), c)).toBeNull();
    expect((await responder(msg('sim', { remetenteTelefone: ADMIN, quando }), c))?.texto).toBe('✅ Aprovado! Mandei para os outros organizadores; falta 1 confirmar.');
  });

  it('"sim" citando o robô, sem marcar: conta; citação sem "sim" ou sem proposta é ignorada', async () => {
    const c = ctx({}, relogio.agora);
    const cita = (texto: string, tel = ADMIN) => passo(texto, c, tel, { mencionaORobo: false, respondeAoRobo: true });
    expect(await cita('sim')).toBeNull();
    await passo('sortear', c, ADMIN);
    expect(await cita('legal')).toBeNull();
    expect((await cita('sim', ADMIN))?.texto).toBe('✅ Aprovado! Mandei para os outros organizadores; falta 1 confirmar.');
  });

  it('sortear, sim ou importar de remetente sem telefone (só LID): uma linha no log', async () => {
    const c = ctx({}, relogio.agora);
    for (const cmd of ['sortear', 'sim', 'importar Ana']) {
      vi.mocked(c.log).mockClear();
      await passo(cmd, c, null);
      expect(c.log).toHaveBeenCalledWith('marcação de remetente sem telefone (LID): não dá para saber se é organizador');
    }
  });

  it('pedido de sorteio em texto livre vai para a IA, que só sorteia pela ferramenta (sem confirmar)', async () => {
    const c = ctx({}, relogio.agora);
    await passo('sorteia os times aí', c, ADMIN);
    expect(c.propor).not.toHaveBeenCalled();
    expect(c.perguntar).toHaveBeenCalledWith('sorteia os times aí', expect.objectContaining({ acoes: expect.arrayContaining([expect.objectContaining({ nome: 'pedir_sorteio', sorteio: true })]) }));
    expect(c.perguntar).toHaveBeenCalledWith('sorteia os times aí', expect.objectContaining({ acoes: expect.not.arrayContaining([expect.objectContaining({ nome: 'confirmar_sorteio' })]) }));
  });
});

describe('importar times (privado)', () => {
  const privado = (texto: string, tel: string | null = ADMIN) =>
    msg(texto, { privado: true, grupoId: `${ADMIN}@s.whatsapp.net`, remetenteTelefone: tel, mencionaORobo: false, remetenteNome: 'Marco' });

  it('organizador no privado: lê os times colados (com as quebras de linha) e vira proposta importada', async () => {
    const c = ctx();
    const r = await responder(privado('importar times:\nTime 1\nAna\n\nTime 2\nBia'), c);
    expect(c.importar).toHaveBeenCalledWith(expect.any(Date), 'Time 1\nAna\n\nTime 2\nBia');
    expect(r?.texto).toBe(textoProposta('Marco', 'importado'));
    expect(c.proposta.atual).toMatchObject({ origem: 'importado', votos: [] });
    expect(c.avisarOrganizadores).not.toHaveBeenCalled();
  });

  it('nomes com problema: responde o que corrigir e não cria proposta', async () => {
    const c = ctx({ importar: vi.fn(async () => ({ erro: '🤔 Não deu para importar:\n- "Anaa": não achei.' })) });
    expect((await responder(privado('importar Anaa'), c))?.texto).toBe('🤔 Não deu para importar:\n- "Anaa": não achei.');
    expect(c.proposta.atual).toBeNull();
  });

  it('no grupo não importa (os times vazariam); quem não é organizador também não', async () => {
    const c = ctx();
    expect((await responder(msg('importar Ana', { remetenteTelefone: ADMIN }), c))?.texto).toBe(TEXTO_IMPORTAR_NO_PRIVADO);
    expect((await responder(msg('importar Ana', { remetenteTelefone: QUALQUER }), ctx()))?.texto).toBe(TEXTO_SO_ADMIN_IMPORTAR);
    expect(c.importar).not.toHaveBeenCalled();
  });
});

describe('times com proposta pendente (sem vazar)', () => {
  it('no grupo: "ainda não foram definidos", mesmo com times salvos; sem proposta, os salvos', async () => {
    const c = ctx({ consultar: vi.fn(async () => '👕 Times de hoje:\n\n🔵 Azul\n- Ana') });
    c.proposta.atual = proposta({ criadaEm: t('2026-11-10T15:30:00') });
    expect((await responder(msg('times'), c))?.texto).toBe(TEXTO_TIMES_INDEFINIDOS);
    expect(c.consultar).not.toHaveBeenCalled();
    c.proposta.atual = null;
    expect((await responder(msg('times'), c))?.texto).toBe('👕 Times de hoje:\n\n🔵 Azul\n- Ana');
  });

  it('proposta vencida não trava mais', async () => {
    const c = ctx({ consultar: vi.fn(async () => '👕 Times de hoje:') });
    c.proposta.atual = proposta({ criadaEm: t('2026-11-10T14:00:00') });
    expect((await responder(msg('times'), c))?.texto).toBe('👕 Times de hoje:');
  });

  it('no privado do organizador: mostra a proposta e quantos votos tem', async () => {
    const c = ctx();
    c.proposta.atual = proposta({ criadaEm: t('2026-11-10T15:30:00'), votos: [ADMIN] });
    const r = await responder(msg('times', { privado: true, grupoId: 'x@s.whatsapp.net', remetenteTelefone: OUTRO_ADMIN, mencionaORobo: false }), c);
    expect(r?.texto).toBe(`⏳ Times esperando confirmação (1 de 2):\n\n${textoProposta()}`);
  });

  it('a ferramenta ver_times da IA segue a mesma regra', async () => {
    const c = ctx();
    c.proposta.atual = proposta({ criadaEm: t('2026-11-10T15:30:00') });
    const f = ferramentasDeAcao(msg('x'), c).find((x) => x.nome === 'ver_times')!;
    expect(await f.executar({})).toEqual(new TextoPronto(TEXTO_TIMES_INDEFINIDOS, 'lista'));
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
  const nomes = ['adicionar_jogador', 'confirmar_jogador', 'remover_jogador', 'ver_lista', 'quem_falta_confirmar', 'ver_fila', 'ver_times', 'artilheiros', 'garcons', 'ranking', 'cadastrar_jogadores', 'link_de_anotar', 'pedir_sorteio'];
  const achar = (fs: ReturnType<typeof ferramentasDeAcao>, nome: string) => fs.find((f) => f.nome === nome)!;

  it('as treze ações, com schema estrito e nenhuma que confirme sorteio', () => {
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
    expect(fs.filter((f) => f.altera || f.sorteio).map((f) => f.nome)).toEqual(['adicionar_jogador', 'confirmar_jogador', 'remover_jogador', 'cadastrar_jogadores', 'pedir_sorteio']);
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
    // Todas vão como texto pronto: o robô manda inteiro (a IA dizia "aqui está o ranking" e não mandava).
    expect(await achar(fs, 'quem_falta_confirmar').executar({})).toEqual(new TextoPronto('⏳ Ainda não confirmaram: Bia.', 'lista'));
    expect(await achar(fs, 'ver_fila').executar({})).toEqual(new TextoPronto('📝 Fila:\n1. Caio', 'lista'));
    const textoLista = (await achar(fs, 'ver_lista').executar({})) as TextoPronto;
    expect(textoLista.como).toBe('lista');
    expect(textoLista.texto).toContain(textoWhatsApp(lista, lista.data));
    for (const [ferramenta, tipo] of [['ver_times', 'times'], ['artilheiros', 'artilheiro'], ['garcons', 'garcom'], ['ranking', 'ranking']] as const) {
      expect(await achar(fs, ferramenta).executar({})).toEqual(new TextoPronto('⚽ Artilheiros (novembro):\n1. Pepe 5', 'lista'));
      expect(c.consultar).toHaveBeenLastCalledWith(tipo, expect.any(Date));
    }
  });

  it('pedir_sorteio: admin pelo telefone da mensagem; guarda a proposta como o comando, e o "sim" confirma', async () => {
    const quando = t('2026-11-11T15:00:00');
    const c = ctx({}, () => quando);
    const r = (await achar(ferramentasDeAcao(msg('sorteia aí', { remetenteTelefone: ADMIN, quando }), c), 'pedir_sorteio').executar({ quem_nao_confirmou: 'deixar_de_fora' })) as TextoPronto;
    expect(r).toMatchObject({ texto: textoProposta(), como: 'sorteio' });
    expect(c.propor).toHaveBeenCalledWith(quando, 4, false);
    expect(c.proposta.atual).toMatchObject({ quemPropos: ADMIN, texto: textoProposta() });
    const sim = await responder(msg('sim', { remetenteTelefone: ADMIN, quando: t('2026-11-11T15:02:00') }), c);
    expect(sim?.texto).toBe('✅ Aprovado! Mandei para os outros organizadores; falta 1 confirmar.');
  });

  it('pedir_sorteio: `times` opcional (3 ou 4) no schema estrito; 3 vai para o sorteio, ausente/estranho vira 4', async () => {
    const quando = t('2026-11-11T15:00:00');
    const c = ctx({}, () => quando);
    const f = achar(ferramentasDeAcao(msg('sorteia em 3 times', { remetenteTelefone: ADMIN, quando }), c), 'pedir_sorteio');
    expect(f.parametros).toEqual({
      type: 'object',
      properties: {
        times: expect.objectContaining({ type: 'integer', enum: [3, 4] }),
        quem_nao_confirmou: expect.objectContaining({ type: 'string', enum: ['incluir', 'deixar_de_fora'] }),
      },
      additionalProperties: false,
    });
    await f.executar({ times: 3, quem_nao_confirmou: 'deixar_de_fora' });
    expect(c.propor).toHaveBeenLastCalledWith(quando, 3, false);
    for (const args of [{}, { times: 4 }, { times: 7 }, { times: '3' }]) {
      await f.executar({ ...args, quem_nao_confirmou: 'deixar_de_fora' });
      expect(c.propor).toHaveBeenLastCalledWith(quando, 4, false);
    }
  });

  it('pedir_sorteio com gente na lista sem confirmar e sem escolha: não sorteia e devolve a pergunta para a IA fazer', async () => {
    const quando = t('2026-11-11T15:00:00');
    const c = ctx({}, () => quando);
    const f = achar(ferramentasDeAcao(msg('quero sortear', { remetenteTelefone: ADMIN, quando }), c), 'pedir_sorteio');
    for (const args of [{}, null, { quem_nao_confirmou: 'talvez' }]) {
      await expect(f.executar(args)).rejects.toEqual(new ErroDeFerramenta(perguntaPendentes(['Bia'])));
    }
    expect(perguntaPendentes(['Bia'])).toContain('Bia está na lista e ainda não confirmou');
    expect(perguntaPendentes(['Bia', 'Caio'])).toContain('Bia e Caio estão na lista e ainda não confirmaram');
    expect(c.propor).not.toHaveBeenCalled();
    expect(c.proposta.atual).toBeNull();
  });

  it('pedir_sorteio "incluir": sorteia com quem não confirmou; sem ninguém pendente, sorteia direto', async () => {
    const quando = t('2026-11-11T15:00:00');
    const c = ctx({}, () => quando);
    await achar(ferramentasDeAcao(msg('sorteia com a Bia', { remetenteTelefone: ADMIN, quando }), c), 'pedir_sorteio').executar({ quem_nao_confirmou: 'incluir' });
    expect(c.propor).toHaveBeenLastCalledWith(quando, 4, true);
    const todos = { ...lista, principal: lista.principal.map((i) => ({ ...i, confirmado: true })) };
    const c2 = ctx({ lerLista: vi.fn(async () => todos) }, () => quando);
    await achar(ferramentasDeAcao(msg('sorteia', { remetenteTelefone: ADMIN, quando }), c2), 'pedir_sorteio').executar({});
    expect(c2.propor).toHaveBeenLastCalledWith(quando, 4, false);
  });

  it('mandar_lista_no_grupo: manda a lista de sempre no grupo, vira a última do grupo e responde aqui', async () => {
    const c = ctx({ listaMandadaNoGrupo: vi.fn() });
    const f = achar(ferramentasDoOrganizador(msg('encaminha a lista no grupo', { remetenteTelefone: ADMIN, privado: true }), c), 'mandar_lista_no_grupo');
    expect(await f.executar({})).toEqual(new TextoPronto(TEXTO_LISTA_MANDADA, 'acao'));
    expect(c.anunciarNoGrupo).toHaveBeenCalledTimes(1);
    expect(vi.mocked(c.anunciarNoGrupo).mock.calls[0][0]).toContain(textoWhatsApp(lista, lista.data));
    expect(c.listaMandadaNoGrupo).toHaveBeenCalledWith(expect.objectContaining({ foto: expect.any(Object) }));
  });

  it('mandar_lista_no_grupo que não sai (23h–8h, queda): erro para a IA, nada gravado', async () => {
    const c = ctx({ anunciarNoGrupo: vi.fn(async () => { throw new Error('passou das 23:00'); }), listaMandadaNoGrupo: vi.fn() });
    const f = achar(ferramentasDoOrganizador(msg('manda a lista lá', { remetenteTelefone: ADMIN, privado: true }), c), 'mandar_lista_no_grupo');
    await expect(f.executar({})).rejects.toBeInstanceOf(ErroDeFerramenta);
    expect(c.listaMandadaNoGrupo).not.toHaveBeenCalled();
  });

  it('pedir_sorteio: descartar a proposta (chegou depois do prazo) limpa só ela', async () => {
    const quando = t('2026-11-11T15:00:00');
    const c = ctx({}, () => quando);
    const r = (await achar(ferramentasDeAcao(msg('sorteia', { remetenteTelefone: ADMIN, quando }), c), 'pedir_sorteio').executar({ quem_nao_confirmou: 'deixar_de_fora' })) as TextoPronto;
    expect(c.proposta.atual).not.toBeNull();
    r.descartar?.();
    expect(c.proposta.atual).toBeNull();
  });

  it('pedir_sorteio que dá erro do sorteio (hoje não tem pelada): erro da ferramenta, nada guardado', async () => {
    const c = ctx({ propor: vi.fn(async () => ({ erro: '📅 Hoje não tem pelada para sortear.' })) });
    await expect(achar(ferramentasDeAcao(msg('sorteia', { remetenteTelefone: ADMIN }), c), 'pedir_sorteio').executar({ quem_nao_confirmou: 'deixar_de_fora' })).rejects.toEqual(new ErroDeFerramenta('📅 Hoje não tem pelada para sortear.'));
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
    // Depois de entrar ou confirmar, a lista atual vai junto; depois de remover, não.
    const esperado = acao === 'remover' ? 'Pepe entrou na lista. (pedido por Zeca)' : `Pepe entrou na lista. (pedido por Zeca)\n\n${LISTA}`;
    expect(r).toMatchObject({ texto: esperado, ehListaCompleta: false });
    expect(r?.gravar).toBeUndefined();
    expect(c.enviar).toHaveBeenCalledWith(esperado);
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
    expect(comIa).toBe(`${TEXTO_AJUDA}\n\n${TEXTO_AJUDA_PERGUNTA}`);
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
    lista: PREFIXOS_CALVINHO.lista!,
    'falta confirmar': PREFIXOS_CALVINHO.falta!,
    fila: PREFIXOS_CALVINHO.fila!,
    times: PREFIXOS_CALVINHO.times!,
    artilheiro: PREFIXOS_CALVINHO.artilheiro!,
    garçom: PREFIXOS_CALVINHO.garcom!,
    ranking: PREFIXOS_CALVINHO.ranking!,
    ajuda: PREFIXOS_CALVINHO.ajuda!,
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
    expect((await responder(doJonas('sortear'), c))!.texto).toBe(`🍀 Sorteando com a sorte do calvinho:\n${textoProposta('Jonas')}`);
    const erro = ctx({ calvinho: [JONAS], admins: [JONAS], propor: vi.fn(async () => ({ erro: '👥 Poucos confirmados para sortear.' })) });
    expect((await responder(doJonas('sortear'), erro))!.texto).toBe('👥 Poucos confirmados para sortear.');
    const naoAdmin = ctx({ calvinho: [JONAS] });
    expect((await responder(doJonas('sortear'), naoAdmin))!.texto).toBe(TEXTO_SO_ADMIN);
  });

  it('sim que fecha no privado: texto salvo do calvinho; erro continua sério', async () => {
    const quando = t('2026-11-10T15:40:00');
    const noPrivado = { privado: true, grupoId: `${JONAS}@s.whatsapp.net`, mencionaORobo: false };
    const c = ctx({ calvinho: [JONAS], admins: [JONAS, ADMIN], proposta: { atual: proposta({ criadaEm: quando, votos: [ADMIN] }) } });
    expect(SALVOS_CALVINHO).toContain((await responder(doJonas('sim', noPrivado), c))!.texto.split('\n')[0]);
    const erro = ctx({ calvinho: [JONAS], admins: [JONAS, ADMIN], proposta: { atual: proposta({ criadaEm: quando, votos: [ADMIN] }) }, salvar: vi.fn(async () => ({ erro: '⚠️ Deu ruim.' })) });
    expect((await responder(doJonas('sim', noPrivado), erro))!.texto).toBe('⚠️ Deu ruim.\nOs times não foram salvos.');
  });

  it('texto desconhecido sem IA: "não entendi" + ajuda; com IA, só a resposta da IA', async () => {
    const semIa = ctx({ ia: null, calvinho: [JONAS] });
    expect((await responder(doJonas('bora jogar'), semIa))!.texto).toBe(`🤔 Não entendi, calvinho. Os comandos são esses:\n${TEXTO_AJUDA}`);
    const comIa = ctx({ calvinho: [JONAS] });
    expect((await responder(doJonas('o João está na lista?'), comIa))!.texto).toBe('O João está na lista.');
  });

  it('adicionar/confirmar/remover em outra pessoa: linha do calvinho antes; nele mesmo, a brincadeira já vem do texto', async () => {
    const outro = ctx({ calvinho: [JONAS], rng: () => 0, mexerNaLista: vi.fn(async () => ({ texto: '✅ Pepe confirmado!', mudou: true })) });
    expect((await responder(doJonas('confirmar Pepe'), outro))!.texto).toBe(`${PREFIXOS_CALVINHO.confirmar![0]}\n✅ Pepe confirmado! (pedido por Jonas)\n\n${LISTA}`);
    const saiu = ctx({ calvinho: [JONAS], rng: () => 0, mexerNaLista: vi.fn(async () => ({ texto: '👋 Pepe saiu da lista.', mudou: true })) });
    expect((await responder(doJonas('remover Pepe'), saiu))!.texto).toBe(`${PREFIXOS_CALVINHO.remover![0]}\n👋 Pepe saiu da lista. (pedido por Jonas)`);
    const ele = ctx({ calvinho: [JONAS], rng: () => 0, mexerNaLista: vi.fn(async () => ({ texto: '✅ Calvinho confirmado! Os refletores agradecem a ajuda 💡', mudou: true })) });
    expect((await responder(doJonas('confirmar Jonas'), ele))!.texto.startsWith('✅ Calvinho confirmado!')).toBe(true);
    const nada = ctx({ calvinho: [JONAS], rng: () => 0, mexerNaLista: vi.fn(async () => ({ texto: '🤔 Zé não está na lista.', mudou: false })) });
    expect((await responder(doJonas('confirmar Zé'), nada))!.texto).toBe('🤔 Zé não está na lista.');
  });

  it('cadastrar e salvar o sorteio também brincam', async () => {
    const c = ctx({ calvinho: [JONAS], admins: [JONAS], rng: () => 0 });
    expect((await responder(doJonas('cadastrar Caio - 2,5'), c))!.texto).toBe(`${PREFIXOS_CALVINHO.cadastrar![0]}\n✅ Cadastrado: Caio (2,5). (pedido por Jonas)`);
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
    const todas = [...Object.values(PREFIXOS_CALVINHO).flat(), PREFIXO_NAO_ENTENDI, ...SALVOS_CALVINHO, ...Object.values(CALVINHO).flat()];
    expect(todas.length).toBeGreaterThan(25);
    for (const v of todas) expect(v!.toLowerCase()).not.toContain('careca');
  });
});

describe('responder: vários nomes numa mensagem', () => {
  it('cada nome pelo caminho de um só, "(pedido por X)" em cada mudança, tudo numa mensagem', async () => {
    const c = ctx({
      mexerNaLista: vi.fn(async (_a: AcaoNaLista, nome: string) => (nome === 'Zé' ? { texto: '🤔 Zé não está na lista.', mudou: false } : { texto: `✅ ${nome} confirmado!`, mudou: true })),
    });
    const r = await responder(msg('confirmar Ana, Zé e Beto'), c);
    const esperado = `✅ Ana confirmado! (pedido por Zeca)\n🤔 Zé não está na lista.\n✅ Beto confirmado! (pedido por Zeca)\n\n${LISTA}`;
    expect(r?.texto).toBe(esperado);
    expect(c.mexerNaLista).toHaveBeenCalledTimes(3);
    expect(c.enviar).toHaveBeenCalledTimes(1);
    expect(c.enviar).toHaveBeenCalledWith(esperado);
  });
  it('mais de 3 nomes: só os 3 primeiros e o aviso', async () => {
    const c = ctx();
    const r = await responder(msg('adicionar A1, B2, C3 e D4'), c);
    expect(c.mexerNaLista).toHaveBeenCalledTimes(3);
    expect(r?.texto?.split('\n\n')[0].split('\n')).toHaveLength(4);
    expect(r?.texto).toContain('\n⚠️ Só mudo até 3 nomes por mensagem. Mande o resto em outra.\n\n');
  });
  it('nome comprido no meio: só aquela linha recusa', async () => {
    const c = ctx();
    const r = await responder(msg(`adicionar Ana, ${'x'.repeat(41)}`), c);
    expect(c.mexerNaLista).toHaveBeenCalledTimes(1);
    expect(r?.texto).toBe(`Pepe entrou na lista. (pedido por Zeca)\n🤔 Nome muito comprido.\n\n${LISTA}`);
  });
});

describe('responder: nome repetido na mesma mensagem', () => {
  it('"Ana, Ana": o segundo já está na lista', async () => {
    let n = 0;
    const c = ctx({ mexerNaLista: vi.fn(async () => (n++ === 0 ? { texto: '✅ Ana entrou na lista!', mudou: true } : { texto: '👍 Ana já está na lista.', mudou: false })) });
    const r = await responder(msg('adicionar Ana, Ana'), c);
    expect(r?.texto).toBe(`✅ Ana entrou na lista! (pedido por Zeca)\n👍 Ana já está na lista.\n\n${LISTA}`);
  });
});

describe('cadastrar', () => {
  it('organizador: cadastra e mostra quem pediu', async () => {
    const c = ctx();
    const m = msg('cadastrar Caio - 2,5', { remetenteTelefone: ADMIN, remetenteNome: 'Marco' });
    const r = await responder(m, c);
    expect(c.cadastrar).toHaveBeenCalledWith([{ nome: 'Caio', nota: 2.5 }], m.quando);
    expect(r?.texto).toBe('✅ Cadastrado: Caio (2,5). (pedido por Marco)');
  });

  it('quem não é organizador, ou sem telefone (LID), não cadastra', async () => {
    for (const tel of [QUALQUER, null]) {
      const c = ctx();
      const r = await responder(msg('cadastrar Caio - 2,5', { remetenteTelefone: tel }), c);
      expect(r?.texto).toBe(TEXTO_SO_ADMIN_CADASTRO);
      expect(c.cadastrar).not.toHaveBeenCalled();
    }
  });

  it('nada cadastrado: sem "pedido por"; mais de 10: avisa', async () => {
    const c = ctx({ cadastrar: vi.fn(async () => ({ texto: '👍 Já estava cadastrado: Caio.', mudou: false })) });
    const muitos = Array.from({ length: 11 }, (_, i) => `J${'a'.repeat(i + 1)} 3`).join(', ');
    const r = await responder(msg(`cadastrar ${muitos}`, { remetenteTelefone: ADMIN }), c);
    expect(r?.texto).toBe(`👍 Já estava cadastrado: Caio.\n${TEXTO_MAX_CADASTROS}`);
  });

  it('pela IA: cadastrar_jogadores usa o mesmo caminho e confere o organizador', async () => {
    const adminCtx = ctx();
    const doAdmin = ferramentasDeAcao(msg('x', { remetenteTelefone: ADMIN, remetenteNome: 'Marco' }), adminCtx).find((f) => f.nome === 'cadastrar_jogadores')!;
    expect(doAdmin.altera).toBe(true);
    const pronto = await doAdmin.executar({ pessoas: 'Caio - 2.5, Pedro - 2.5' });
    expect(adminCtx.cadastrar).toHaveBeenCalledWith(
      [
        { nome: 'Caio', nota: 2.5 },
        { nome: 'Pedro', nota: 2.5 },
      ],
      expect.any(Date),
    );
    expect(pronto).toBeInstanceOf(TextoPronto);
    expect((pronto as TextoPronto).texto).toBe('✅ Cadastrado: Caio (2,5). (pedido por Marco)');

    const outroCtx = ctx();
    const deOutro = ferramentasDeAcao(msg('x'), outroCtx).find((f) => f.nome === 'cadastrar_jogadores')!;
    await expect(deOutro.executar({ pessoas: 'Caio - 2.5' })).rejects.toThrow(TEXTO_SO_ADMIN_CADASTRO);
    expect(outroCtx.cadastrar).not.toHaveBeenCalled();
    await expect(doAdmin.executar({ pessoas: '' })).rejects.toBeInstanceOf(ErroDeFerramenta);
  });
});

describe('cadastrar sem nota', () => {
  it('ninguém com nota: não cadastra e pede a nota', async () => {
    const c = ctx();
    const r = await responder(msg('cadastrar Pedro, João', { remetenteTelefone: ADMIN }), c);
    expect(c.cadastrar).not.toHaveBeenCalled();
    expect(r?.texto).toBe('✍️ Faltou a nota de Pedro e João. Mande de novo com a nota, assim: *cadastrar Pedro - 2,5, João - 3*');
  });

  it('parte com nota: cadastra essa parte e pede a nota do resto', async () => {
    const c = ctx();
    const r = await responder(msg('cadastrar Caio - 2,5, Pedro', { remetenteTelefone: ADMIN, remetenteNome: 'Marco' }), c);
    expect(c.cadastrar).toHaveBeenCalledWith([{ nome: 'Caio', nota: 2.5 }], expect.any(Date));
    expect(r?.texto).toBe('✅ Cadastrado: Caio (2,5). (pedido por Marco)\n✍️ Faltou a nota de Pedro. Mande de novo com a nota, assim: *cadastrar Pedro - 2,5*');
  });

  it('pela IA, sem nota: erro para o modelo pedir a nota', async () => {
    const c = ctx();
    const f = ferramentasDeAcao(msg('x', { remetenteTelefone: ADMIN }), c).find((x) => x.nome === 'cadastrar_jogadores')!;
    await expect(f.executar({ pessoas: 'Pedro' })).rejects.toThrow('Faltou a nota de Pedro');
    expect(c.cadastrar).not.toHaveBeenCalled();
  });
});

describe('lista depois de entrar ou confirmar pela IA', () => {
  it('a ferramenta marca; a resposta da IA ganha a lista atual', async () => {
    const c = ctx({
      perguntar: vi.fn(async (_t: string, op: { acoes: ReturnType<typeof ferramentasDeAcao> }) => {
        const r = await op.acoes.find((f) => f.nome === 'confirmar_jogador')!.executar({ nome: 'Ana' });
        return `Beleza!\n${(r as TextoPronto).texto}`;
      }),
    });
    const r = await responder(msg('eu vou'), c);
    expect(r?.texto).toBe(`Beleza!\nPepe entrou na lista. (pedido por Zeca)\n\n${LISTA}`);
  });

  it('sem mudança, ou só remoção: sem lista extra; lista já na resposta: não repete', async () => {
    const remover = ctx({
      perguntar: vi.fn(async (_t: string, op: { acoes: ReturnType<typeof ferramentasDeAcao> }) => {
        await op.acoes.find((f) => f.nome === 'remover_jogador')!.executar({ nome: 'Ana' });
        return 'Feito.';
      }),
    });
    expect((await responder(msg('me tira'), remover))?.texto).toBe('Feito.');
    const comLista = ctx({
      perguntar: vi.fn(async (_t: string, op: { acoes: ReturnType<typeof ferramentasDeAcao> }) => {
        await op.acoes.find((f) => f.nome === 'adicionar_jogador')!.executar({ nome: 'Ana' });
        return `Feito.\n\n${LISTA}`;
      }),
    });
    expect((await responder(msg('bota a Ana'), comLista))?.texto).toBe(`Feito.\n\n${LISTA}`);
  });
});

describe('apelidos (ROBO_APELIDOS)', () => {
  it('lê "telefone=Nome" separados por vírgula, ignorando pares quebrados', () => {
    expect(apelidosDoEnv({ ROBO_APELIDOS: ' 5581990000001 = Marquinho , quebrado, =Zé' })).toEqual([{ telefone: '5581990000001', nome: 'Marquinho' }]);
    expect(apelidosDoEnv({})).toEqual([]);
  });

  it('"confirmar eu" usa o jogador do apelido; sem apelido, o nome do WhatsApp', async () => {
    const c = ctx({ apelidos: [{ telefone: ADMIN, nome: 'Marquinho' }] });
    await responder(msg('confirmar eu', { remetenteTelefone: ADMIN, remetenteNome: 'Marco Filho' }), c);
    expect(c.mexerNaLista).toHaveBeenCalledWith('confirmar', 'Marquinho', expect.any(Date));
    const sem = ctx();
    await responder(msg('confirmar eu', { remetenteNome: 'Zeca' }), sem);
    expect(sem.mexerNaLista).toHaveBeenCalledWith('confirmar', 'Zeca', expect.any(Date));
  });

  it('a IA recebe o nome do jogador de quem fala', async () => {
    const c = ctx({ apelidos: [{ telefone: ADMIN, nome: 'Marquinho' }] });
    await responder(msg('eu vou', { remetenteTelefone: ADMIN, remetenteNome: 'Marco Filho' }), c);
    expect(c.perguntar).toHaveBeenCalledWith('eu vou', expect.objectContaining({ quem: 'Marco Filho', jogador: 'Marquinho' }));
    const outro = ctx({ apelidos: [{ telefone: ADMIN, nome: 'Marquinho' }] });
    await responder(msg('eu vou'), outro);
    expect(outro.perguntar).toHaveBeenCalledWith('eu vou', expect.objectContaining({ jogador: null }));
  });
});

describe('privado dos organizadores', () => {
  const privado = (texto: string, over: Partial<MensagemRecebida> = {}) =>
    msg(texto, { grupoId: `${ADMIN}@s.whatsapp.net`, remetenteTelefone: ADMIN, remetenteNome: 'Marco', mencionaORobo: false, privado: true, ...over });

  it('organizador: atende sem marcar, mesmo de madrugada', async () => {
    const c = ctx();
    const r = await responder(privado('notas', { quando: t('2026-11-11T02:00:00') }), c);
    expect(r?.texto).toBe('📋 Notas (2 jogadores):\nAna 3,0\nBia 2,5');
    expect(c.enviar).toHaveBeenCalledWith(r?.texto);
  });

  it('quem não é organizador, ou sem telefone (LID), é ignorado sem resposta', async () => {
    for (const tel of [QUALQUER, null]) {
      const c = ctx();
      expect(await responder(privado('notas', { remetenteTelefone: tel }), c)).toBeNull();
      expect(c.enviar).not.toHaveBeenCalled();
      expect(c.log).toHaveBeenCalled();
    }
  });

  it('nota Fulano 3,5 muda a nota; site dá o link', async () => {
    const c = ctx();
    expect((await responder(privado('nota Ana 3,5'), c))?.texto).toBe('✅ Nota de Ana: 3,0 → 3,5.');
    expect(c.mudarNota).toHaveBeenCalledWith('Ana', 3.5, expect.any(Date));
    expect((await responder(privado('site'), ctx()))?.texto).toBe('🌐 Site da pelada: https://pelada.exemplo\n🔐 Área dos organizadores: https://pelada.exemplo/admin');
  });

  it('comandos do grupo valem; a lista no privado nunca vira a "última lista" do grupo', async () => {
    const c = ctx();
    const r = await responder(privado('lista'), c);
    expect(r?.texto).toContain(LISTA);
    expect(r).toMatchObject({ ehListaCompleta: false, gravar: undefined });
    expect((await responder(privado('cadastrar Caio - 2,5'), ctx()))?.texto).toBe('✅ Cadastrado: Caio (2,5). (pedido por Marco)');
  });

  it('ajuda do privado: sem marcar, todos os comandos de organizador e, com IA, a dica de falar normal', async () => {
    expect((await responder(privado('ajuda'), ctx({ ia: null })))?.texto).toBe(TEXTO_AJUDA_PRIVADO);
    expect((await responder(privado('ajuda'), ctx()))?.texto).toBe(`${TEXTO_AJUDA_PRIVADO}\n\n${TEXTO_AJUDA_PRIVADO_IA}`);
    for (const c of ['sortear', 'importar', 'sim', 'times', 'anotar', 'notas', 'nota Fulano', 'cadastrar', 'site', 'lista']) expect(TEXTO_AJUDA_PRIVADO).toContain(c);
  });

  it('texto livre: a IA recebe as ferramentas de organizador e sabe que é privado; no grupo, não', async () => {
    const c = ctx();
    await responder(privado('qual a nota do Pepe?'), c);
    const op = (c.perguntar as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(op.privado).toBe(true);
    expect(op.acoes.map((f: { nome: string }) => f.nome)).toEqual(expect.arrayContaining(['ver_notas', 'mudar_nota', 'link_do_site']));
    const g = ctx();
    await responder(msg('qual a nota do Pepe?'), g);
    const opGrupo = (g.perguntar as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(opGrupo.privado).toBe(false);
    expect(opGrupo.acoes.map((f: { nome: string }) => f.nome)).not.toContain('ver_notas');
  });

  it('mudar_nota pela IA: texto pronto quando muda; erro quando não muda ou nota inválida', async () => {
    const c = ctx();
    const [, mudar] = ferramentasDoOrganizador(privado('x'), c);
    expect(((await mudar.executar({ nome: 'Ana', nota: '3.5' })) as TextoPronto).texto).toBe('✅ Nota de Ana: 3,0 → 3,5.');
    expect(c.mudarNota).toHaveBeenCalledWith('Ana', 3.5, expect.any(Date));
    const nao = ctx({ mudarNota: vi.fn(async () => ({ texto: '🤔 Zé não está cadastrado.', mudou: false })) });
    await expect(ferramentasDoOrganizador(privado('x'), nao)[1].executar({ nome: 'Zé', nota: '3' })).rejects.toThrow('Zé não está cadastrado');
  });
});

describe('anotar (link temporário)', () => {
  // A data é a da pelada (o link pode ser gerado antes, na segunda), e a validade, a madrugada seguinte a ela.
  const LINK = '📝 Link para anotar as partidas de quarta, 18/11:\nhttps://pelada.exemplo/anotar/CHAVE\nAbre direto na tela de partidas, sem senha. Vale até as 3h de quinta, 19/11; um link novo cancela este.';

  it('virada de mês: a validade cai no dia 1º', async () => {
    const c = ctx({ linkAnotar: vi.fn(async () => ({ url: 'https://pelada.exemplo/anotar/CHAVE', data: '2026-09-30' })) });
    const r = await responder(msg('anotar', { remetenteTelefone: ADMIN, remetenteNome: 'Marco' }), c);
    expect(r?.texto).toContain('partidas de quarta, 30/09:');
    expect(r?.texto).toContain('Vale até as 3h de quinta, 01/10;');
  });

  it('organizador no grupo: o link vai para o grupo, com quem pediu', async () => {
    const c = ctx();
    const r = await responder(msg('anotar', { remetenteTelefone: ADMIN, remetenteNome: 'Marco' }), c);
    expect(c.linkAnotar).toHaveBeenCalledWith('Marco', expect.any(Date));
    expect(r?.texto).toBe(`${LINK} (pedido por Marco)`);
    expect((await responder(msg('link de anotar', { remetenteTelefone: ADMIN, remetenteNome: 'Marco' }), ctx()))?.texto).toBe(`${LINK} (pedido por Marco)`);
  });

  it('organizador no privado também', async () => {
    const c = ctx();
    const r = await responder(msg('anotar', { grupoId: `${ADMIN}@s.whatsapp.net`, remetenteTelefone: ADMIN, remetenteNome: 'Marco', mencionaORobo: false, privado: true }), c);
    expect(r?.texto).toBe(`${LINK} (pedido por Marco)`);
  });

  it('quem não é organizador, ou sem telefone, não gera link', async () => {
    for (const tel of [QUALQUER, null]) {
      const c = ctx();
      expect((await responder(msg('anotar', { remetenteTelefone: tel }), c))?.texto).toBe(TEXTO_SO_ADMIN_ANOTAR);
      expect(c.linkAnotar).not.toHaveBeenCalled();
    }
  });

  it('sem pelada hoje: o aviso', async () => {
    const c = ctx({ linkAnotar: vi.fn(async () => ({ erro: '📅 Hoje não tem pelada para anotar.' })) });
    expect((await responder(msg('anotar', { remetenteTelefone: ADMIN }), c))?.texto).toBe('📅 Hoje não tem pelada para anotar.');
  });

  it('pela IA: texto pronto para organizador; erro para os outros', async () => {
    const doAdmin = ferramentasDeAcao(msg('x', { remetenteTelefone: ADMIN, remetenteNome: 'Marco' }), ctx()).find((f) => f.nome === 'link_de_anotar')!;
    expect(((await doAdmin.executar({})) as TextoPronto).texto).toBe(`${LINK} (pedido por Marco)`);
    const deOutro = ferramentasDeAcao(msg('x'), ctx()).find((f) => f.nome === 'link_de_anotar')!;
    await expect(deOutro.executar({})).rejects.toThrow(TEXTO_SO_ADMIN_ANOTAR);
  });
});

describe('privado: conversa em mensagens curtas e tudo por linguagem natural', () => {
  const noPrivado = (texto: string, tel = ADMIN, nome = 'Marco') =>
    msg(texto, { privado: true, grupoId: `${tel}@s.whatsapp.net`, remetenteTelefone: tel, remetenteNome: nome, mencionaORobo: false });

  it('a resposta da IA em partes sai em várias mensagens, uma por vez; no grupo, numa só', async () => {
    const c = ctx({ perguntar: vi.fn(async () => ['Opa, Marco!', 'Tá tudo certo pra quarta 💪']) });
    const r = await responder(noPrivado('e aí, como tá a pelada?'), c);
    expect(c.enviar).toHaveBeenNthCalledWith(1, 'Opa, Marco!');
    expect(c.enviar).toHaveBeenNthCalledWith(2, 'Tá tudo certo pra quarta 💪');
    expect(r?.texto).toBe('Opa, Marco!\n\nTá tudo certo pra quarta 💪');
    const g = ctx({ perguntar: vi.fn(async () => ['Opa!', 'Tudo certo.']) });
    await responder(msg('e aí?'), g);
    expect(g.enviar).toHaveBeenCalledTimes(1);
    expect(g.enviar).toHaveBeenCalledWith('Opa!\n\nTudo certo.');
  });

  it('confirmar_times: o voto é de quem está falando (como o "sim")', async () => {
    const c = ctx();
    c.proposta.atual = proposta({ criadaEm: t('2026-11-10T15:30:00'), quemPropos: OUTRO_ADMIN, votos: [OUTRO_ADMIN] });
    const f = ferramentasDoOrganizador(noPrivado('pode confirmar'), c).find((x) => x.nome === 'confirmar_times')!;
    expect(((await f.executar({})) as TextoPronto).texto).toBe(`${TEXTO_SALVOS}\nZeca decide quando mandar no grupo.`);
    expect(c.salvar).toHaveBeenCalledWith(expect.any(Date), expect.objectContaining({ votos: [OUTRO_ADMIN, ADMIN] }));
  });

  it('importar_times: lê os times da própria mensagem (sem a linha do pedido) e vira proposta', async () => {
    const c = ctx();
    const f = ferramentasDoOrganizador(noPrivado('importa esses times aí\nTime 1\nAna\n\nTime 2\nBia'), c).find((x) => x.nome === 'importar_times')!;
    expect(f.sorteio).toBe(true);
    expect(((await f.executar({})) as TextoPronto).texto).toBe(textoProposta('Marco', 'importado'));
    expect(c.importar).toHaveBeenCalledWith(expect.any(Date), 'Time 1\nAna\n\nTime 2\nBia');
    const ruim = ctx({ importar: vi.fn(async () => ({ erro: '🤔 Não deu para importar.' })) });
    const g = ferramentasDoOrganizador(noPrivado('Time 1\nAnaa'), ruim).find((x) => x.nome === 'importar_times')!;
    await expect(g.executar({})).rejects.toThrow('Não deu para importar');
  });
});

describe('aviso de dupla separada só no privado', () => {
  const AVISO = '⚠️ Luiz e Jonas estão no mesmo time (dupla separada).\nSó vocês, organizadores, veem este aviso.';
  const comAviso = { ...TIMES, aviso: AVISO };

  it('sortear no grupo: o grupo vê a proposta sem o aviso; quando quem sorteou aprova, os outros recebem com o aviso', async () => {
    const c = ctx({ propor: vi.fn(async () => comAviso) });
    const r = await responder(msg('sortear', { remetenteTelefone: ADMIN }), c);
    expect(r?.texto).toBe(textoProposta());
    await responder(msg('sim', { remetenteTelefone: ADMIN, quando: t('2026-11-10T15:41:00') }), c);
    expect(c.avisarOrganizadores).toHaveBeenLastCalledWith(
      `✅ Zeca aprovou estes times. Responda *sim* para confirmar: com o seu, eles ficam salvos no site.\n\n🎲 Times sorteados por Zeca:\n\n${BLOCOS}\n\n${AVISO}`,
      [ADMIN],
    );
  });

  it('no privado, quem pediu vê o aviso', async () => {
    const c = ctx({ importar: vi.fn(async () => comAviso) });
    const r = await responder(msg('importar Time 1', { privado: true, grupoId: 'x@s.whatsapp.net', remetenteTelefone: ADMIN, remetenteNome: 'Marco', mencionaORobo: false }), c);
    expect(r?.texto).toBe(`${textoProposta('Marco', 'importado')}\n\n${AVISO}`);
  });
});

describe('privado: memória da conversa, troca nos times e desfazer', () => {
  const noPrivado = (texto: string, tel = ADMIN, nome = 'Marco', quando = t('2026-11-10T15:40:00')) =>
    msg(texto, { privado: true, grupoId: `${tel}@s.whatsapp.net`, remetenteTelefone: tel, remetenteNome: nome, mencionaORobo: false, quando });

  it('a IA recebe as falas anteriores do privado (e o grupo nunca recebe histórico)', async () => {
    const memoria = new ConversasPrivadas();
    const perguntar = vi.fn(async () => 'Feito!');
    const c = ctx({ memoria, perguntar });
    await responder(noPrivado('sortear'), c);
    await responder(noPrivado('troca o Caio pelo Jonas'), c);
    const op = (perguntar.mock.calls.at(-1) as unknown as [string, { historico?: unknown }])[1];
    expect(op.historico).toEqual([
      { papel: 'user', texto: 'sortear' },
      { papel: 'assistant', texto: c.proposta.atual!.texto },
    ]);
    await responder(msg('e aí?'), c);
    expect((perguntar.mock.calls.at(-1) as unknown as [string, { historico?: unknown }])[1].historico).toBeUndefined();
  });

  it('desfazer: volta as mudanças da última mensagem que mexeu na lista (da última para a primeira)', async () => {
    const memoria = new ConversasPrivadas();
    const mudanca = (nome: string) => ({ peladaId: 1, jogadorId: nome.length, nome, antes: { tipo: 'M' as const, status: 'confirmado' as const, entrouEm: t('2026-11-09T00:00:00') } });
    const desfazer = vi.fn(async () => {});
    const c = ctx({
      memoria,
      desfazer,
      mexerNaLista: vi.fn(async (_a: AcaoNaLista, nome: string) => ({ texto: `👋 ${nome} saiu da lista.`, mudou: true, mudanca: mudanca(nome) })),
    });
    // A IA tira dois na mesma mensagem.
    c.perguntar = vi.fn(async (_t: string, op: { acoes: ReturnType<typeof ferramentasDeAcao> }) => {
      const tirar = op.acoes.find((f) => f.nome === 'remover_jogador')!;
      await tirar.executar({ nome: 'Caio' });
      await tirar.executar({ nome: 'Bia' });
      return 'Pronto.';
    }) as ContextoDaResposta['perguntar'];
    await responder(noPrivado('tira o caio e a bia'), c);
    const f = ferramentasDoOrganizador(noPrivado('desfaz'), c).find((x) => x.nome === 'desfazer_mudanca_na_lista')!;
    const r = (await f.executar({})) as TextoPronto;
    expect(desfazer).toHaveBeenCalledWith([mudanca('Bia'), mudanca('Caio')], expect.any(Date));
    expect(r.texto).toBe(`↩️ Desfeito: Caio e Bia voltaram como estava.\n\n${LISTA}`);
    // Já desfeito: não tem mais nada.
    await expect(f.executar({})).rejects.toThrow(TEXTO_NADA_PARA_DESFAZER);
  });

  it('desfazer sem mudança guardada (ou de outro organizador): explica', async () => {
    const memoria = new ConversasPrivadas();
    const c = ctx({ memoria, desfazer: vi.fn(async () => {}), mexerNaLista: vi.fn(async () => ({ texto: '👋 Caio saiu da lista.', mudou: true, mudanca: { peladaId: 1, jogadorId: 3, nome: 'Caio', antes: null } })) });
    await responder(noPrivado('remover Caio', OUTRO_ADMIN, 'Pepe'), c);
    const f = ferramentasDoOrganizador(noPrivado('desfaz'), c).find((x) => x.nome === 'desfazer_mudanca_na_lista')!;
    await expect(f.executar({})).rejects.toThrow(TEXTO_NADA_PARA_DESFAZER);
    expect(c.desfazer).not.toHaveBeenCalled();
  });

  it('trocar_nos_times: troca na proposta de quem propôs e mostra os times de novo', async () => {
    const nova = proposta({ texto: 'TIMES NOVOS', criadaEm: t('2026-11-10T15:40:00') });
    const trocarNosTimes = vi.fn(async () => ({ proposta: nova, feitas: ['Caio ↔ Jonas'] }));
    const c = ctx({ trocarNosTimes });
    c.proposta.atual = proposta({ criadaEm: t('2026-11-10T15:30:00') });
    const f = ferramentasDoOrganizador(noPrivado('troca o caio pelo jonas'), c).find((x) => x.nome === 'trocar_nos_times')!;
    const r = (await f.executar({ trocas: 'Caio por Jonas' })) as TextoPronto;
    expect(trocarNosTimes).toHaveBeenCalledWith(expect.objectContaining({ quemPropos: ADMIN }), [{ de: 'Caio', por: 'Jonas' }], expect.any(Date));
    expect(r.texto).toBe('🔁 Troquei: Caio ↔ Jonas.\n\nTIMES NOVOS');
    expect(c.proposta.atual).toBe(nova);
    // Ninguém tinha recebido os times ainda: não avisa os outros.
    expect(c.avisarOrganizadores).not.toHaveBeenCalled();
  });

  it('trocar_nos_times depois de quem propôs aprovar: os outros ficam sabendo que aqueles times não valem', async () => {
    const c = ctx({ trocarNosTimes: vi.fn(async () => ({ proposta: proposta(), feitas: ['Ana ↔ Bia'] })) });
    c.proposta.atual = proposta({ criadaEm: t('2026-11-10T15:30:00'), votos: [ADMIN] });
    await ferramentasDoOrganizador(noPrivado('x'), c).find((x) => x.nome === 'trocar_nos_times')!.executar({ trocas: 'Ana por Bia' });
    expect(c.avisarOrganizadores).toHaveBeenCalledWith(expect.stringContaining('Zeca trocou jogadores'), [ADMIN]);
  });

  it('trocar_nos_times: sem proposta, proposta de outro ou troca que não dá', async () => {
    const semProposta = ctx({ trocarNosTimes: vi.fn() });
    await expect(ferramentasDoOrganizador(noPrivado('x'), semProposta).find((x) => x.nome === 'trocar_nos_times')!.executar({ trocas: 'A por B' })).rejects.toThrow(
      TEXTO_SEM_TIMES_PARA_TROCAR,
    );
    const deOutro = ctx({ trocarNosTimes: vi.fn() });
    deOutro.proposta.atual = proposta({ criadaEm: t('2026-11-10T15:30:00'), quemPropos: OUTRO_ADMIN, quemProposNome: 'Pepe' });
    await expect(ferramentasDoOrganizador(noPrivado('x'), deOutro).find((x) => x.nome === 'trocar_nos_times')!.executar({ trocas: 'A por B' })).rejects.toThrow('Só Pepe');
    const recusa = ctx({ trocarNosTimes: vi.fn(async () => ({ erro: '🤔 Ana e Bia já estão no mesmo time.' })) });
    recusa.proposta.atual = proposta({ criadaEm: t('2026-11-10T15:30:00') });
    const antes = recusa.proposta.atual;
    await expect(ferramentasDoOrganizador(noPrivado('x'), recusa).find((x) => x.nome === 'trocar_nos_times')!.executar({ trocas: 'Ana por Bia' })).rejects.toThrow('mesmo time');
    expect(recusa.proposta.atual).toBe(antes);
  });

  it('lerTrocas: "por", "pelo", "x", vírgula não separa, ponto e vírgula e linha separam', () => {
    expect(lerTrocas('Caio por Jonas; Pedro pelo Paulo\nAna x Bia')).toEqual([
      { de: 'Caio', por: 'Jonas' },
      { de: 'Pedro', por: 'Paulo' },
      { de: 'Ana', por: 'Bia' },
    ]);
    expect(lerTrocas('só o Caio')).toEqual([]);
  });
});

describe('reações na mensagem (perguntas à IA)', () => {
  it('⌛ antes de perguntar; só respondeu: tira a ampulheta depois do envio', async () => {
    const ordem: string[] = [];
    const c = ctx({
      reagir: vi.fn((e: string) => void ordem.push(`reagir ${e}`)),
      perguntar: vi.fn(async () => {
        ordem.push('perguntar');
        return 'O João está na lista.';
      }),
      enviar: vi.fn(async () => void ordem.push('enviar')),
    });
    await responder(msg('quem vai?'), c);
    expect(ordem).toEqual(['reagir ⏳', 'perguntar', 'enviar', 'reagir ']);
  });

  it('a IA fez uma ação: ✅ no fim', async () => {
    const c = ctx({
      reagir: vi.fn(),
      perguntar: vi.fn(async (_t: string, op: { acoes: ReturnType<typeof ferramentasDeAcao> }) => {
        await op.acoes.find((f) => f.nome === 'remover_jogador')!.executar({ nome: 'Ana' });
        return 'Feito.';
      }),
    });
    await responder(msg('me tira'), c);
    expect(c.reagir).toHaveBeenNthCalledWith(1, '⏳');
    expect(c.reagir).toHaveBeenLastCalledWith('✅');
  });

  it('ação que falhou não vale ✅', async () => {
    const c = ctx({
      reagir: vi.fn(),
      perguntar: vi.fn(async (_t: string, op: { acoes: ReturnType<typeof ferramentasDeAcao> }) => {
        await op.acoes.find((f) => f.nome === 'cadastrar_jogadores')!.executar({ pessoas: 'Pedro' }).catch(() => {});
        return 'Faltou a nota.';
      }),
    });
    await responder(msg('bota o Pedro no sistema aí', { remetenteTelefone: ADMIN }), c);
    expect(c.reagir).toHaveBeenLastCalledWith('');
  });

  it('IA com erro, ou a resposta não saiu: ❌', async () => {
    const erro = ctx({ reagir: vi.fn(), perguntar: vi.fn(async () => ERRO_IA) });
    await responder(msg('quem vai?'), erro);
    expect(erro.reagir).toHaveBeenLastCalledWith('❌');
    const semEnvio = ctx({ reagir: vi.fn(), enviar: vi.fn(async () => Promise.reject(new Error('caiu'))) });
    await responder(msg('quem vai?'), semEnvio);
    expect(semEnvio.reagir).toHaveBeenLastCalledWith('❌');
  });

  it('comando pronto (sem IA) ou limite de perguntas: não reage', async () => {
    const c = ctx({ reagir: vi.fn() });
    await responder(msg('lista'), c);
    await responder(msg('artilheiro'), c);
    expect(c.reagir).not.toHaveBeenCalled();
  });

  it('no privado também', async () => {
    const c = ctx({ reagir: vi.fn() });
    await responder(msg('como tá a lista?', { privado: true, grupoId: 'conversa', remetenteTelefone: ADMIN, mencionaORobo: false }), c);
    expect((c.reagir as ReturnType<typeof vi.fn>).mock.calls.map((x) => x[0])).toEqual(['⏳', '']);
  });
});

describe('limite de envio do ZapGate segurando a resposta', () => {
  const limite = (tipo: 'minuto' | 'hora' | 'dia', esperarMs = 30_000) => new ErroDeLimite(`limite por ${tipo}`, tipo, esperarMs);

  it('comando segurado: ⌛, espera, manda e tira a ⌛', async () => {
    const esperas: number[] = [];
    const enviar = vi.fn().mockRejectedValueOnce(limite('minuto', 20_000)).mockResolvedValue(undefined);
    const c = ctx({ reagir: vi.fn(), enviar, esperar: async (ms: number) => void esperas.push(ms) });
    const r = await responder(msg('lista'), c);
    expect(r?.texto).toContain(LISTA);
    expect(enviar).toHaveBeenCalledTimes(2);
    expect(esperas).toEqual([22_000]);
    expect((c.reagir as ReturnType<typeof vi.fn>).mock.calls.map((x) => x[0])).toEqual(['⏳', '']);
  });

  it('pergunta à IA segurada: não repete a ⌛; no fim, a reação de sempre', async () => {
    const enviar = vi.fn().mockRejectedValueOnce(limite('hora', 60_000)).mockResolvedValue(undefined);
    const c = ctx({ reagir: vi.fn(), enviar, esperar: async () => {} });
    await responder(msg('quem vai?'), c);
    expect((c.reagir as ReturnType<typeof vi.fn>).mock.calls.map((x) => x[0])).toEqual(['⏳', '']);
  });

  it('espera demais (ou limite do dia): desiste com ❌', async () => {
    const longo = ctx({ reagir: vi.fn(), enviar: vi.fn(async () => Promise.reject(limite('hora', 3_400_000))), esperar: async () => {} });
    expect(await responder(msg('lista'), longo)).toBeNull();
    expect(longo.reagir).toHaveBeenLastCalledWith('❌');
    const enviarSempre = vi.fn(async () => Promise.reject(limite('minuto', 60_000)));
    const sempre = ctx({ reagir: vi.fn(), enviar: enviarSempre, esperar: async () => {} });
    expect(await responder(msg('lista'), sempre)).toBeNull();
    expect(enviarSempre.mock.calls.length).toBeGreaterThan(5);
    expect(sempre.reagir).toHaveBeenLastCalledWith('❌');
    const dia = ctx({ reagir: vi.fn(), enviar: vi.fn(async () => Promise.reject(limite('dia'))), esperar: async () => {} });
    expect(await responder(msg('lista'), dia)).toBeNull();
    expect(dia.enviar).toHaveBeenCalledTimes(1);
    expect(dia.reagir).toHaveBeenLastCalledWith('❌');
  });
});

describe('privado: resposta descartada quando chega outra mensagem', () => {
  const PRIV = { privado: true, grupoId: 'conversa', remetenteTelefone: ADMIN, mencionaORobo: false };

  it('pergunta ou consulta: descarta sem enviar', async () => {
    const cancelar = { pedido: () => true, cancelou: false };
    const c = ctx({ cancelar });
    expect(await responder(msg('como tá a lista?', PRIV), c)).toBeNull();
    expect(cancelar.cancelou).toBe(true);
    expect(c.enviar).not.toHaveBeenCalled();
  });

  it('a IA fez uma ação ou é comando de mudança: não descarta', async () => {
    const acao = { pedido: () => true, cancelou: false };
    const c = ctx({
      cancelar: acao,
      perguntar: vi.fn(async (_t: string, op: { acoes: ReturnType<typeof ferramentasDeAcao> }) => {
        await op.acoes.find((f) => f.nome === 'remover_jogador')!.executar({ nome: 'Ana' });
        return 'Feito';
      }),
    });
    expect(await responder(msg('me tira aí', PRIV), c)).not.toBeNull();
    expect(acao.cancelou).toBe(false);
    const cmd = { pedido: () => true, cancelou: false };
    const d = ctx({ cancelar: cmd });
    await responder(msg('remover Ana', PRIV), d);
    expect(cmd.cancelou).toBe(false);
    expect(d.enviar).toHaveBeenCalled();
  });

  it('sem mensagem nova: envia normal', async () => {
    const cancelar = { pedido: () => false, cancelou: false };
    const c = ctx({ cancelar });
    await responder(msg('como tá a lista?', PRIV), c);
    expect(cancelar.cancelou).toBe(false);
    expect(c.enviar).toHaveBeenCalled();
  });
});

describe('privado: 1ª parte cancelada no ZapGate quando chega outra mensagem', () => {
  const PRIV = { privado: true, grupoId: 'conversa', remetenteTelefone: ADMIN, mencionaORobo: false };

  it('cancelada antes de sair: descarta para refazer (sem ❌ nem resto das partes)', async () => {
    let chegou = false;
    const cancelar = { pedido: () => chegou, cancelou: false };
    const enviar = vi.fn(async (_t: string, op?: { cancelavel?: () => boolean }) => {
      chegou = true; // a pessoa escreveu enquanto a 1ª parte "digitava"
      return op?.cancelavel?.() ? ('cancelada' as const) : undefined;
    });
    const c = ctx({ cancelar, enviar, reagir: vi.fn(), perguntar: vi.fn(async () => ['Oxe, faço um bocado de coisa', 'Quer começar por qual?']) });
    expect(await responder(msg('o que você faz?', PRIV), c)).toBeNull();
    expect(cancelar.cancelou).toBe(true);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(c.reagir).not.toHaveBeenCalledWith('❌');
  });

  it('só a 1ª parte é cancelável; ação feita pela IA nunca é', async () => {
    const enviar = vi.fn(async (...args: [string, { cancelavel?: () => boolean }?]) => void args);
    const c = ctx({ cancelar: { pedido: () => false, cancelou: false }, enviar, perguntar: vi.fn(async () => ['a', 'b']) });
    await responder(msg('oi', PRIV), c);
    expect(enviar.mock.calls.map((x) => typeof x[1]?.cancelavel)).toEqual(['function', 'undefined']);
    const acao = vi.fn(async (...args: [string, { cancelavel?: () => boolean }?]) => void args);
    const d = ctx({
      cancelar: { pedido: () => true, cancelou: false },
      enviar: acao,
      perguntar: vi.fn(async (_t: string, op: { acoes: ReturnType<typeof ferramentasDeAcao> }) => {
        await op.acoes.find((f) => f.nome === 'remover_jogador')!.executar({ nome: 'Ana' });
        return 'Feito';
      }),
    });
    await responder(msg('me tira', PRIV), d);
    expect(acao.mock.calls[0][1]).toBeUndefined();
  });
});

describe('resposta que saiu pela metade', () => {
  it('a 2ª parte bateu no limite: sem ❌ (a ⌛ sai), e fica no log', async () => {
    const enviar = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValue(new ErroDeLimite('limite por hora', 'hora', 3_000_000));
    const c = ctx({ reagir: vi.fn(), enviar, esperar: async () => {}, perguntar: vi.fn(async () => ['Oxe, faço um bocado', 'Quer começar por qual?']) });
    const r = await responder(msg('o que você faz?', { privado: true, grupoId: 'conversa', remetenteTelefone: ADMIN, mencionaORobo: false }), c);
    expect(r).not.toBeNull();
    expect((c.reagir as ReturnType<typeof vi.fn>).mock.calls.map((x) => x[0])).toEqual(['⏳', '']);
    expect(c.log).toHaveBeenCalledWith(expect.stringContaining('resposta saiu pela metade (1 de 2 partes)'));
  });
});

describe('privado com enviarPartes (ZapGate): uma entrega só', () => {
  const PRIV = { privado: true, grupoId: 'conversa', remetenteTelefone: ADMIN, mencionaORobo: false };

  it('as partes vão juntas, canceláveis; cancelada: descarta para refazer', async () => {
    const enviarPartes = vi.fn(async (...args: [string[], { cancelavel?: () => boolean }?]) => (args[1]?.cancelavel?.() ? ('cancelada' as const) : undefined));
    let chegou = false;
    const c = ctx({ enviarPartes, cancelar: { pedido: () => chegou, cancelou: false }, perguntar: vi.fn(async () => ['Oxe', 'Quer qual?']) });
    await responder(msg('o que você faz?', PRIV), c);
    expect(enviarPartes).toHaveBeenCalledTimes(1);
    expect(enviarPartes.mock.calls[0][0]).toEqual(['Oxe', 'Quer qual?']);
    expect(c.enviar).not.toHaveBeenCalled();
    chegou = true;
    const d = ctx({ enviarPartes, cancelar: { pedido: () => false, cancelou: false }, perguntar: vi.fn(async () => {
      chegou = true;
      return ['a', 'b'];
    }) });
    const cancelar = { pedido: () => chegou, cancelou: false };
    expect(await responder(msg('oi', PRIV), { ...d, cancelar })).toBeNull();
    expect(cancelar.cancelou).toBe(true);
  });

  it('uma parte só: usa enviar', async () => {
    const enviarPartes = vi.fn(async () => undefined);
    const c = ctx({ enviarPartes });
    await responder(msg('como tá a lista?', PRIV), c);
    expect(enviarPartes).not.toHaveBeenCalled();
    expect(c.enviar).toHaveBeenCalled();
  });
});

describe('envio incerto (fila do ZapGate sem confirmação)', () => {
  it('pode ter saído: sem ❌', async () => {
    const enviarPartes = vi.fn(async () => Promise.reject(new EnvioIncerto('sem confirmação')));
    const c = ctx({ reagir: vi.fn(), enviarPartes, perguntar: vi.fn(async () => ['a', 'b']) });
    await responder(msg('oi', { privado: true, grupoId: 'conversa', remetenteTelefone: ADMIN, mencionaORobo: false }), c);
    expect(c.reagir).not.toHaveBeenCalledWith('❌');
  });
});
