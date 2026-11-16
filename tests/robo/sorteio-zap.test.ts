import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores, partidas, peladas, presencas, times } from '@/db/schema';
import {
  deGuardada,
  ehAdmin,
  importarTimesColados,
  INSTRUCOES_VOTO,
  montarProposta,
  paraGuardar,
  paraWhatsApp,
  propostaVencida,
  salvarProposta,
  sortearTimesDaNoite,
  TEXTO_SO_ADMIN,
  VALIDADE_MS,
  votar,
  VOTOS_NECESSARIOS,
  type TimesPropostos,
} from '@/robo/sorteio-zap';
import { timesDaPelada } from '@/server/times';
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
    expect(p).toMatchObject({ origem: 'sorteio', quemPropos: ADMIN, quemProposNome: 'Marco', criadaEm: QUARTA, peladaId, votos: [] });
    expect(p.elencos.flat()).toHaveLength(10);
    expect(p.completes).toHaveLength(p.elencos.length);
    expect(p.blocos).toMatch(/^🔵 Azul \(\d+,\d\)\n- \S+ \d,\d/);
    expect(p.blocos).toContain('- COMPLETE ');
    expect(p.blocos).toMatch(/\n\nDiferença: \d+,\d$/);
    expect(p.texto).toBe(`🎲 Times sorteados por Marco:\n\n${p.blocos}\n\n${INSTRUCOES_VOTO}`);
  });

  it('sem pelada hoje ou com poucos confirmados devolve erro e não cria nada', async () => {
    const antes = await tudo();
    for (const d of ['2026-11-18T15:00:00Z', '2026-11-12T15:00:00Z', '2026-11-10T15:00:00Z']) {
      expect(await sortearTimesDaNoite(db, new Date(d), rng)).toEqual({ erro: '📅 Hoje não tem pelada para sortear.' });
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
    expect(p.texto.startsWith('📥 Times importados por Marco:\n\n🔵 Azul (14,0)')).toBe(true);
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

  it('sem pelada hoje', async () => {
    expect(await importarTimesColados(db, new Date('2026-11-12T15:00:00Z'), colado)).toEqual({ erro: '📅 Hoje não tem pelada para importar times.' });
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
