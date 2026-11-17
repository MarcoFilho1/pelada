import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores, partidas, peladas, presencas, times } from '@/db/schema';
import {
  deGuardada,
  ehAdmin,
  importarTimesColados,
  INSTRUCOES_VOTO,
  TEXTO_COMPLETE,
  textoDeFora,
  montarProposta,
  paraGuardar,
  paraWhatsApp,
  propostaVencida,
  salvarProposta,
  sortearTimesDaNoite,
  TEXTO_SO_ADMIN,
  trocarNaProposta,
  TEXTO_SEM_PELADA_DA_SEMANA,
  avisoDeDuplas,
  anuncioDeGuardado,
  anuncioParaGuardar,
  VALIDADE_MS,
  votar,
  VOTOS_NECESSARIOS,
  type TimesPropostos,
} from '@/robo/sorteio-zap';
import { timesDaPelada } from '@/server/times';
import { duplasSeparadas } from '@/db/schema';
import { createTestDb } from '../helpers/db';

let db: DB;
let peladaId: number;
// terça 10/11/2026 12:00 em Recife; a pelada é quarta 2026-11-11, então "hoje" = quarta 12:00 Recife
const QUARTA = new Date('2026-11-11T15:00:00Z');
const ADMIN = '5581990000001';
let semente = 0;
const rng = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);

async function tudo() {
  const r = await db.execute(sql`
    select (select coalesce(json_agg(t order by t::text), '[]') from times t) t,
           (select coalesce(json_agg(t order by t::text), '[]') from time_jogadores t) tj,
           (select coalesce(json_agg(t order by t::text), '[]') from time_completes t) tc,
           (select coalesce(json_agg(t order by t::text), '[]') from peladas t) p,
           (select coalesce(json_agg(t order by t::text), '[]') from presencas t) pr,
           (select coalesce(json_agg(t order by t::text), '[]') from partidas t) pa`);
  return JSON.stringify((r as unknown as { rows: unknown[] }).rows);
}

beforeEach(async () => {
  semente = 7;
  db = await createTestDb();
  [{ id: peladaId }] = await db.insert(peladas).values({ data: '2026-11-11' }).returning();
  const nomes = ['Ana', 'Beto', 'Caio', 'Davi', 'Edu', 'Fabio', 'Gil', 'Hugo', 'Ivo', 'Jonas'];
  const js = await db.insert(jogadores).values(nomes.map((nome, i) => ({ nome, nota: (2 + (i % 4)).toFixed(1) }))).returning();
  await db.insert(presencas).values(js.map((j) => ({ peladaId, jogadorId: j.id, tipo: 'M' as const, status: 'confirmado' as const })));
});

describe('ehAdmin', () => {
  it('compara só dígitos, com ou sem 55 e com ou sem o 9 extra', () => {
    const admins = ['+55 (81) 99000-0001'];
    for (const t of ['5581990000001', '558190000001', '+55 81 99000-0001']) expect(ehAdmin(t, admins)).toBe(true);
    for (const t of ['5581990000002', '', '55', '5511990000001', 'abc', '81990000001', '8190000001']) expect(ehAdmin(t, admins)).toBe(false);
  });
  it('admin cadastrado sem o 9 também casa com quem manda com o 9', () => {
    expect(ehAdmin('5581990000001', ['558190000001'])).toBe(true);
  });
  it('remetente sem 55 é recusado: +81 (Japão) não vira DDD 81', () => {
    expect(ehAdmin('+81 90 0000 0001', ['5581990000001', '81990000001'])).toBe(false);
    expect(ehAdmin('819000000001', ['558190000001'])).toBe(false);
  });
  it('admin cadastrado sem 55 e sem 9 casa com remetente completo', () => {
    expect(ehAdmin('5581990000001', ['8190000001'])).toBe(true);
  });
  it('lista vazia não tem admin', () => expect(ehAdmin('5581990000001', [])).toBe(false));
  it('texto fixo', () => expect(TEXTO_SO_ADMIN).toBe('🔐 Só os organizadores podem sortear pelo WhatsApp.'));
});

const quem = { telefone: ADMIN, nome: 'Marco' };
const mais = (min: number, s = 0) => new Date(QUARTA.getTime() + min * 60_000 + s * 1000);
const sorteados = async (n: 3 | 4 = 4) => (await sortearTimesDaNoite(db, QUARTA, rng, n)) as TimesPropostos;
const proposta = async (n: 3 | 4 = 4) => montarProposta('sorteio', quem, QUARTA, await sorteados(n));

describe('sortearTimesDaNoite + montarProposta', () => {
  it('sorteia sem gravar nada; a proposta tem os times com notas, a diferença e como confirmar', async () => {
    const antes = await tudo();
    const p = await proposta();
    expect(await tudo()).toBe(antes);
    expect(p).toMatchObject({ origem: 'sorteio', quemPropos: ADMIN, quemProposNome: 'Marco', criadaEm: QUARTA, peladaId, votos: [], data: '2026-11-11' });
    expect(p.elencos.flat()).toHaveLength(10);
    expect(p.completes).toHaveLength(p.elencos.length);
    expect(p.blocos).toMatch(/^🔵 Azul \(\d+,\d\)\n- \S+ \d,\d/);
    expect(p.blocos).toContain('- COMPLETE ');
    expect(p.blocos).toMatch(/\n\nDiferença: \d+,\d$/);
    // Com COMPLETE nos times, a linha que explica o que ele é (a IA chegou a dizer que era erro).
    expect(p.texto).toBe(`🎲 Times sorteados por Marco para quarta, 11/11:\n\n${p.blocos}\n\n${TEXTO_COMPLETE}\n\n${INSTRUCOES_VOTO}`);
  });

  it('sem COMPLETE (16 jogadores em 4 times), a proposta não traz a linha do COMPLETE', async () => {
    const extras = await db.insert(jogadores).values(['Lia', 'Mel', 'Nina', 'Olga', 'Pia', 'Rui'].map((nome) => ({ nome, nota: '3.0' }))).returning();
    await db.insert(presencas).values(extras.map((j) => ({ peladaId, jogadorId: j.id, tipo: 'D' as const, status: 'confirmado' as const })));
    const p = await proposta();
    expect(p.completes.flat()).toEqual([]);
    expect(p.texto).not.toContain(TEXTO_COMPLETE);
  });

  it('quem está na lista sem confirmar fica fora e aparece numa linha; com incluirPendentes entra, e o salvar aceita', async () => {
    await db.execute(sql`update presencas set status = 'pendente' where jogador_id in (select id from jogadores where nome in ('Ana', 'Beto'))`);
    const fora = (await sortearTimesDaNoite(db, QUARTA, rng)) as TimesPropostos;
    expect(fora.deFora).toEqual(['Ana', 'Beto']);
    expect(fora.comPendentes).toBeUndefined();
    const pf = montarProposta('sorteio', quem, QUARTA, fora);
    expect(pf.elencos.flat()).toHaveLength(8);
    expect(pf.texto).toContain(textoDeFora(['Ana', 'Beto']));
    expect(textoDeFora(['Ana', 'Beto'])).toBe('⏳ Fora do sorteio por não terem confirmado: Ana e Beto.');
    expect(textoDeFora(['Ana'])).toBe('⏳ Fora do sorteio por não ter confirmado: Ana.');

    const com = (await sortearTimesDaNoite(db, QUARTA, rng, 4, true)) as TimesPropostos;
    expect(com.deFora).toBeUndefined();
    const pc = montarProposta('sorteio', quem, QUARTA, com);
    expect(pc).toMatchObject({ comPendentes: true });
    expect(pc.elencos.flat()).toHaveLength(10);
    expect(pc.texto).not.toContain('⏳ Fora do sorteio');
    // Volta igual do estado.json, e a troca de time mantém a escolha.
    expect(deGuardada(JSON.parse(JSON.stringify(paraGuardar(pc))))).toMatchObject({ comPendentes: true });
    const ids = pc.elencos.map((e) => e[0]);
    const nomes = await db.select({ id: jogadores.id, nome: jogadores.nome }).from(jogadores);
    const nome = (id: number) => nomes.find((j) => j.id === id)!.nome;
    const trocada = await trocarNaProposta(db, pc, [{ de: nome(ids[0]), por: nome(ids[1]) }], QUARTA);
    expect('proposta' in trocada && trocada.proposta.comPendentes).toBe(true);
    // O "salvar" confere a lista do mesmo jeito que o sorteio: com os pendentes, não recusa como "lista mudou".
    expect(await salvarProposta(db, mais(1), pc)).toEqual({ ok: true });
    expect(await salvarProposta(db, mais(2), pf)).toEqual({ ok: true });
  });

  it('deGuardada recusa comPendentes ou deFora fora do formato', async () => {
    const g = paraGuardar(await proposta())!;
    expect(deGuardada({ ...g, comPendentes: 'sim' })).toBeNull();
    expect(deGuardada({ ...g, deFora: [1] })).toBeNull();
    expect(deGuardada({ ...g, deFora: ['Ana'] })).toMatchObject({ deFora: ['Ana'] });
  });

  it('vale em qualquer dia para a pelada da semana (ex.: na terça, a de quarta)', async () => {
    const r = (await sortearTimesDaNoite(db, new Date('2026-11-10T15:00:00Z'), rng)) as TimesPropostos;
    expect(r).toMatchObject({ peladaId, data: '2026-11-11' });
  });

  it('lista da próxima quarta ainda não aberta, ou poucos confirmados: erro e não cria nada', async () => {
    const antes = await tudo();
    // Quinta e quarta seguinte: a próxima quarta (18/11) ainda não tem pelada. Quarta depois das 22:30 também já é a seguinte.
    for (const d of ['2026-11-18T15:00:00Z', '2026-11-12T15:00:00Z', '2026-11-12T01:40:00Z']) {
      expect(await sortearTimesDaNoite(db, new Date(d), rng)).toEqual({ erro: TEXTO_SEM_PELADA_DA_SEMANA });
    }
    expect(await tudo()).toBe(antes);
    await db.execute(sql`update presencas set status = 'removido' where id > 1`);
    expect(await sortearTimesDaNoite(db, QUARTA, rng)).toEqual({ erro: '👥 Poucos confirmados para sortear.' });
  });

  it('padrão 4; com 3: Azul, Laranja e Verde (10 jogadores: 4, 3, 3 com 2 COMPLETE)', async () => {
    expect((await proposta(4)).elencos).toHaveLength(4);
    const p = await proposta(3);
    expect(p.elencos).toHaveLength(3);
    expect(p.completes.flat()).toHaveLength(2);
    expect(p.elencos.map((e, i) => e.length + p.completes[i].length)).toEqual([4, 4, 4]);
    expect(p.blocos).toContain('🟢 Verde');
    expect(p.blocos).not.toContain('⚫');
  });
});

describe('votar (2 de 3)', () => {
  it('o 1º voto conta (falta 1), repetido não conta de novo (aceita variação do número), o 2º fecha', async () => {
    const p = await proposta();
    const a = votar(p, ADMIN, mais(1));
    expect(a.resultado).toEqual({ tipo: 'contou', faltam: 1 });
    expect(a.proposta.votos).toEqual([ADMIN]);
    expect(p.votos).toEqual([]);
    expect(votar(a.proposta, '558190000001', mais(2)).resultado).toEqual({ tipo: 'ja_votou', faltam: 1 });
    expect(votar(a.proposta, '5581990000002', mais(3)).resultado).toEqual({ tipo: 'fechou' });
  });

  it('com 60 minutos ou mais, vencida', async () => {
    const p = await proposta();
    expect(votar(p, ADMIN, mais(59, 59)).resultado.tipo).toBe('contou');
    expect(votar(p, ADMIN, mais(60)).resultado).toEqual({ tipo: 'vencida' });
    expect(propostaVencida(p, mais(60))).toBe(true);
    expect(VALIDADE_MS).toBe(60 * 60_000);
    expect(VOTOS_NECESSARIOS).toBe(2);
  });
});

describe('salvarProposta', () => {
  it('grava exatamente os times mostrados (3 times)', async () => {
    const p = await proposta(3);
    expect(await salvarProposta(db, mais(1), p)).toEqual({ ok: true });
    const ts = await timesDaPelada(db, peladaId);
    expect(ts.map((t) => t.cor)).toEqual(['azul', 'laranja', 'verde']);
    expect(ts.map((t) => t.jogadores.map((j) => j.id).sort())).toEqual(p.elencos.map((e) => [...e].sort()));
    expect(ts.map((t) => t.completes.map((c) => c.nota))).toEqual(p.completes);
  });

  it('sorteio com a lista mudada depois da proposta: não grava', async () => {
    const p = await proposta();
    await db.execute(sql`update presencas set status = 'removido' where id = (select min(id) from presencas)`);
    const antes = await tudo();
    expect(await salvarProposta(db, mais(1), p)).toEqual({ erro: '🔄 A lista mudou desde o sorteio. Peça *sortear* de novo.' });
    expect(await tudo()).toBe(antes);
  });

  it('partida em andamento: repassa o erro do site e não grava', async () => {
    const p = await proposta();
    expect(await salvarProposta(db, mais(1), p)).toEqual({ ok: true });
    const [a, b] = await db.select().from(times);
    await db.insert(partidas).values({ peladaId, timeAId: a.id, timeBId: b.id });
    const antes = await tudo();
    expect(await salvarProposta(db, mais(2), p)).toEqual({ erro: '⚠️ Tem partida em andamento; encerre antes de sortear de novo.' });
    expect(await tudo()).toBe(antes);
  });
});

describe('importarTimesColados', () => {
  const colado = 'Time 1\nAna\nBeto\nCaio\nDavi\n\nTime 2\nEdu\nFabio\nGil\nHugo';

  it('casa os nomes com os ativos, soma as notas e não grava; vira proposta "importado"', async () => {
    const antes = await tudo();
    const r = (await importarTimesColados(db, QUARTA, colado)) as TimesPropostos;
    expect(await tudo()).toBe(antes);
    expect(r.peladaId).toBe(peladaId);
    expect(r.times.map((t) => t.jogadores.map((j) => j.nome))).toEqual([['Ana', 'Beto', 'Caio', 'Davi'], ['Edu', 'Fabio', 'Gil', 'Hugo']]);
    expect(r.times[0].soma).toBe(2 + 3 + 4 + 5);
    const p = montarProposta('importado', quem, QUARTA, r);
    expect(p.texto.startsWith('📥 Times importados por Marco para quarta, 11/11:\n\n🔵 Azul (14,0)')).toBe(true);
    // Importado salva sem conferir a lista (os times vieram de fora).
    expect(await salvarProposta(db, mais(1), p)).toEqual({ ok: true });
  });

  it('nome não achado, ambíguo ou repetido: diz o que corrigir', async () => {
    await db.insert(jogadores).values({ nome: 'Caique', nota: '3.0' });
    const r = await importarTimesColados(db, QUARTA, 'Time 1\nAnaa\nCa\nBeto\nBeto\n\nTime 2\nEdu\nFabio');
    expect(r).toEqual({
      erro: [
        '🤔 Não deu para importar:',
        '- "Anaa": não achei. Você quis dizer Ana?',
        '- "Ca": serve para Caio, Caique. Mande o nome inteiro.',
        '- Beto aparece mais de uma vez.',
        'Corrija e mande *importar* com os times de novo.',
      ].join('\n'),
    });
  });

  it('lista da próxima quarta não aberta', async () => {
    expect(await importarTimesColados(db, new Date('2026-11-12T15:00:00Z'), colado)).toEqual({ erro: TEXTO_SEM_PELADA_DA_SEMANA });
  });
});

describe('guardar e ler a proposta (estado.json)', () => {
  it('ida e volta mantém tudo; formato estranho vira null', async () => {
    const p = votar(await proposta(), ADMIN, mais(1)).proposta;
    const guardada = JSON.parse(JSON.stringify(paraGuardar(p)));
    expect(deGuardada(guardada)).toEqual(p);
    expect(paraGuardar(null)).toBeNull();
    for (const ruim of [null, 1, {}, { ...guardada, criadaEm: 'x' }, { ...guardada, votos: [1] }, { ...guardada, origem: 'outra' }]) expect(deGuardada(ruim)).toBeNull();
  });
});

describe('paraWhatsApp (textos de erro do site)', () => {
  it('troca o "Recarregue a página." por "Tente de novo."', () => {
    expect(paraWhatsApp('Essa pelada não existe mais. Recarregue a página.')).toBe('⚠️ Essa pelada não existe mais. Tente de novo.');
    expect(paraWhatsApp('Não deu certo.')).toBe('⚠️ Não deu certo.');
  });
});

describe('duplas separadas no robô', () => {
  const idDe = async (nome: string) => (await db.select().from(jogadores)).find((j) => j.nome === nome)!.id;

  it('o sorteio do robô nunca junta a dupla e, sem dupla junta, não tem aviso', async () => {
    const [a, b] = [await idDe('Ana'), await idDe('Jonas')];
    await db.insert(duplasSeparadas).values({ jogadorAId: Math.min(a, b), jogadorBId: Math.max(a, b) });
    for (let i = 0; i < 15; i++) {
      const r = (await sortearTimesDaNoite(db, QUARTA, rng)) as TimesPropostos;
      expect(r.times.some((t) => t.jogadores.some((j) => j.id === a) && t.jogadores.some((j) => j.id === b))).toBe(false);
      expect(r.aviso).toBeUndefined();
    }
  });

  it('times importados com a dupla junta: não mexe nos times, só avisa (e o aviso fica fora do texto do grupo)', async () => {
    const [a, b] = [await idDe('Ana'), await idDe('Beto')];
    await db.insert(duplasSeparadas).values({ jogadorAId: Math.min(a, b), jogadorBId: Math.max(a, b) });
    const r = (await importarTimesColados(db, QUARTA, 'Time 1\nAna\nBeto\n\nTime 2\nCaio\nDavi')) as TimesPropostos;
    expect(r.aviso).toBe('⚠️ Ana e Beto estão no mesmo time (dupla separada).\nSó vocês, organizadores, veem este aviso.');
    const p = montarProposta('importado', quem, QUARTA, r);
    expect(p.aviso).toBe(r.aviso);
    expect(p.texto).not.toContain('dupla separada');
    expect(deGuardada(JSON.parse(JSON.stringify(paraGuardar(p))))).toEqual(p);
  });

  it('avisoDeDuplas: uma linha por dupla junta', () => {
    const times = [
      { jogadores: [{ id: 1, nome: 'Luiz', nota: 3 }, { id: 2, nome: 'Jonas', nota: 3 }], completes: [], soma: 6 },
      { jogadores: [{ id: 3, nome: 'Ana', nota: 3 }], completes: [], soma: 3 },
    ];
    expect(avisoDeDuplas(times, [[1, 2]])).toBe('⚠️ Luiz e Jonas estão no mesmo time (dupla separada).\nSó vocês, organizadores, veem este aviso.');
    expect(avisoDeDuplas(times, [[1, 3]])).toBeUndefined();
  });
});

describe('anúncio pendente (estado.json)', () => {
  it('ida e volta; formato estranho vira null', () => {
    const a = { texto: 'T', quemPropos: ADMIN, quemProposNome: 'Marco', peladaId: 1, criadoEm: QUARTA };
    expect(anuncioDeGuardado(JSON.parse(JSON.stringify(anuncioParaGuardar(a))))).toEqual(a);
    expect(anuncioParaGuardar(null)).toBeNull();
    for (const ruim of [null, {}, { ...a, criadoEm: 'x' }, { ...a, peladaId: '1' }]) expect(anuncioDeGuardado(ruim)).toBeNull();
  });
});

describe('trocarNaProposta (troca jogadores entre os times de uma proposta)', () => {
  const quemPropos = { telefone: ADMIN, nome: 'Marco' };
  const idDe = async (nome: string) => (await db.select().from(jogadores)).find((j) => j.nome === nome)!.id;
  const propostaImportada = async () => {
    const r = (await importarTimesColados(db, QUARTA, 'Time 1\nAna\nBeto\n\nTime 2\nCaio\nDavi')) as TimesPropostos;
    return { ...montarProposta('importado', quemPropos, QUARTA, r), votos: [ADMIN] };
  };
  const DEPOIS = new Date(QUARTA.getTime() + 10 * 60_000);

  it('troca de time, refaz as somas, zera os votos e renova a validade', async () => {
    const p = await propostaImportada();
    const r = await trocarNaProposta(db, p, [{ de: 'ana', por: 'Caio' }], DEPOIS);
    if ('erro' in r) throw new Error(r.erro);
    expect(r.proposta.elencos).toEqual([[await idDe('Caio'), await idDe('Beto')], [await idDe('Ana'), await idDe('Davi')]]);
    expect(r.proposta.blocos).toContain('🔵 Azul (7,0)\n- Caio 4,0\n- Beto 3,0');
    expect(r.proposta.blocos).toContain('🟠 Laranja (7,0)\n- Ana 2,0\n- Davi 5,0');
    expect(r.proposta.votos).toEqual([]);
    expect(r.proposta.criadaEm).toEqual(DEPOIS);
    expect(r.proposta.texto).toContain(INSTRUCOES_VOTO);
    expect(r.feitas).toEqual(['Ana ↔ Caio']);
  });

  it('várias trocas de uma vez, na ordem', async () => {
    const r = await trocarNaProposta(db, await propostaImportada(), [{ de: 'Ana', por: 'Caio' }, { de: 'Beto', por: 'Davi' }], DEPOIS);
    if ('erro' in r) throw new Error(r.erro);
    expect(r.proposta.elencos).toEqual([[await idDe('Caio'), await idDe('Davi')], [await idDe('Ana'), await idDe('Beto')]]);
  });

  it('recusa: mesmo time, quem não está nos times e nome que não existe (nada muda)', async () => {
    const p = await propostaImportada();
    expect(await trocarNaProposta(db, p, [{ de: 'Ana', por: 'Beto' }], DEPOIS)).toEqual({ erro: '🤔 Ana e Beto já estão no mesmo time.' });
    expect(await trocarNaProposta(db, p, [{ de: 'Ana', por: 'Jonas' }], DEPOIS)).toEqual({
      erro: '🤔 Jonas não está nos times. Para pôr alguém de fora, mude a lista e sorteie de novo.',
    });
    expect(await trocarNaProposta(db, p, [{ de: 'Zé', por: 'Ana' }], DEPOIS)).toEqual({ erro: '🤔 Zé não está nos times.' });
    expect(p.votos).toEqual([ADMIN]);
  });

  it('dupla separada que fica junta com a troca: aviso para os organizadores', async () => {
    const [a, d] = [await idDe('Ana'), await idDe('Davi')];
    await db.insert(duplasSeparadas).values({ jogadorAId: Math.min(a, d), jogadorBId: Math.max(a, d) });
    const r = await trocarNaProposta(db, await propostaImportada(), [{ de: 'Beto', por: 'Davi' }], DEPOIS);
    if ('erro' in r) throw new Error(r.erro);
    expect(r.proposta.aviso).toBe('⚠️ Ana e Davi estão no mesmo time (dupla separada).\nSó vocês, organizadores, veem este aviso.');
  });
});
