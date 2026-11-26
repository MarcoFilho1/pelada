import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores, lances, partidaJogadores, partidas, peladas } from '@/db/schema';
import { lerParaAnotar, limparEnvio, receberEnvio } from '@/server/anotacao-do-app';
import { encerrarPartida, iniciarPartida } from '@/server/partidas';
import { rankingDoPeriodo } from '@/server/ranking';
import { salvarTimesDefinitivos, timesDaPelada } from '@/server/times';
import { createTestDb } from '../helpers/db';

const HOJE = '2026-11-11';
const NOITE = new Date('2026-11-11T20:40:00-03:00');
const depois = (ms: number) => new Date(NOITE.getTime() + ms).toISOString();
const MIN = 60_000;

let db: DB;

/** Pelada de hoje com 3 times de 2 e um jogador de fora (Gil). */
async function cenario() {
  const [p] = await db.insert(peladas).values({ data: HOJE }).returning({ id: peladas.id });
  const ids: number[] = [];
  for (const nome of ['Ana', 'Bia', 'Caio', 'Davi', 'Edu', 'Fábio', 'Gil']) {
    const [j] = await db.insert(jogadores).values({ nome, agarra: nome === 'Gil' }).returning({ id: jogadores.id });
    ids.push(j.id);
  }
  const [a1, a2, l1, l2, v1, v2, gil] = ids;
  await salvarTimesDefinitivos(db, p.id, [
    [a1, a2],
    [l1, l2],
    [v1, v2],
  ]);
  const [branco, preto, verde] = (await timesDaPelada(db, p.id)).map((t) => t.id);
  return { peladaId: p.id, a1, a2, l1, l2, v1, v2, gil, branco, preto, verde };
}

const partida = (c: Awaited<ReturnType<typeof cenario>>, extra: Record<string, unknown> = {}) => ({
  origem: 'app-0001-aaaa',
  timeAId: c.branco,
  timeBId: c.preto,
  iniciadaEm: depois(0),
  encerradaEm: depois(8 * MIN),
  pausadoMs: 30_000,
  desempate: null,
  completam: { A: [], B: [] },
  goleiros: { A: null, B: null },
  lances: [
    { jogadorId: c.a2, tipo: 'assistencia', tempoMs: 60_000 },
    { jogadorId: c.a1, tipo: 'gol', tempoMs: 60_000 },
    { jogadorId: c.l1, tipo: 'gol', tempoMs: 5 * MIN },
    { jogadorId: c.a1, tipo: 'gol', tempoMs: 7 * MIN },
  ],
  ...extra,
});

beforeEach(async () => {
  db = await createTestDb();
});

describe('limparEnvio', () => {
  it('aceita um envio bem formado e recusa o resto', async () => {
    const c = await cenario();
    expect(limparEnvio({ data: HOJE, partidas: [partida(c)] })?.partidas).toHaveLength(1);
    expect(limparEnvio({ data: HOJE, partidas: [] })?.partidas).toEqual([]);
    for (const ruim of [
      null,
      {},
      { data: '11/11/2026', partidas: [] },
      { data: HOJE, partidas: [partida(c, { origem: 'x' })] },
      { data: HOJE, partidas: [partida(c, { timeAId: 0 })] },
      { data: HOJE, partidas: [partida(c, { iniciadaEm: 'ontem' })] },
      { data: HOJE, partidas: [partida(c, { pausadoMs: -1 })] },
      { data: HOJE, partidas: [partida(c, { desempate: 'C' })] },
      { data: HOJE, partidas: [partida(c, { lances: [{ jogadorId: c.a1, tipo: 'falta', tempoMs: 0 }] })] },
      { data: HOJE, partidas: [partida(c, { lances: [{ jogadorId: c.a1, tipo: 'gol', tempoMs: -5 }] })] },
      { data: HOJE, partidas: [partida(c, { goleiros: { A: 'Gil', B: null } })] },
      { data: HOJE, partidas: [partida(c, { substituir: 'sim' })] },
    ]) {
      expect(limparEnvio(ruim), JSON.stringify(ruim)).toBeNull();
    }
  });
});

describe('receberEnvio', () => {
  it('grava a partida inteira: resultado do placar, elenco, lances na ordem, e ela entra no ranking', async () => {
    const c = await cenario();
    const r = await receberEnvio(db, limparEnvio({ data: HOJE, partidas: [partida(c)] })!);
    expect(r).toEqual([{ origem: 'app-0001-aaaa', situacao: 'gravada', id: expect.any(Number) }]);
    const [p] = await db.select().from(partidas);
    expect(p).toMatchObject({ timeAId: c.branco, timeBId: c.preto, resultado: 'A', pausadoMs: 30_000, origem: 'app-0001-aaaa', desempate: null });
    expect(p.encerradaEm?.toISOString()).toBe(depois(8 * MIN));
    expect(await db.select().from(partidaJogadores)).toHaveLength(4);
    const ls = await db.select().from(lances).orderBy(asc(lances.criadoEm), asc(lances.id));
    expect(ls.map((l) => [l.jogadorId, l.tipo, l.tempoMs])).toEqual([
      [c.a2, 'assistencia', 60_000],
      [c.a1, 'gol', 60_000],
      [c.l1, 'gol', 5 * MIN],
      [c.a1, 'gol', 7 * MIN],
    ]);
    const ranking = await rankingDoPeriodo(db, { tipo: 'geral' });
    expect(ranking.find((l) => l.nome === 'Ana')).toMatchObject({ gols: 2, vitorias: 1 });
    expect(ranking.find((l) => l.nome === 'Bia')).toMatchObject({ assistencias: 1, vitorias: 1 });
  });

  it('a mesma partida mandada de novo não grava de novo', async () => {
    const c = await cenario();
    const envio = limparEnvio({ data: HOJE, partidas: [partida(c)] })!;
    const [um] = (await receberEnvio(db, envio))!;
    const [dois] = (await receberEnvio(db, envio))!;
    expect(dois).toEqual({ origem: 'app-0001-aaaa', situacao: 'repetida', id: (um as { id: number }).id });
    expect(await db.select().from(partidas)).toHaveLength(1);
    expect(await db.select().from(lances)).toHaveLength(4);
  });

  it('corrigida no app: os lances novos ficam no lugar dos gravados e o resultado é refeito', async () => {
    const c = await cenario();
    const [um] = (await receberEnvio(db, limparEnvio({ data: HOJE, partidas: [partida(c)] })!))!; // Branco 2 × 1 Preto
    // No app: tiraram um gol da Ana e puseram um do Davi, sem minuto. Agora é Branco 1 × 2 Preto.
    const lancesNovos = [
      { jogadorId: c.a2, tipo: 'assistencia', tempoMs: 60_000 },
      { jogadorId: c.a1, tipo: 'gol', tempoMs: 60_000 },
      { jogadorId: c.l1, tipo: 'gol', tempoMs: 5 * MIN },
      { jogadorId: c.l2, tipo: 'gol', tempoMs: null },
    ];
    const corrigida = limparEnvio({ data: HOJE, partidas: [partida(c, { substituir: true, lances: lancesNovos })] })!;
    const [dois] = (await receberEnvio(db, corrigida))!;
    expect(dois).toEqual({ origem: 'app-0001-aaaa', situacao: 'corrigida', id: (um as { id: number }).id });
    const [p] = await db.select().from(partidas);
    expect(p.resultado).toBe('B');
    const gravados = await db.select().from(lances).orderBy(asc(lances.criadoEm));
    expect(gravados.map((l) => [l.jogadorId, l.tipo, l.tempoMs])).toEqual([
      [c.a2, 'assistencia', 60_000],
      [c.a1, 'gol', 60_000],
      [c.l1, 'gol', 5 * MIN],
      [c.l2, 'gol', null],
    ]);
    // Mandar a correção de novo dá no mesmo; e lance de quem não está na partida é recusado sem mexer em nada.
    expect((await receberEnvio(db, corrigida))![0].situacao).toBe('corrigida');
    const ruim = limparEnvio({ data: HOJE, partidas: [partida(c, { substituir: true, lances: [{ jogadorId: c.v1, tipo: 'gol', tempoMs: null }] })] })!;
    expect((await receberEnvio(db, ruim))![0]).toMatchObject({ situacao: 'recusada', motivo: 'fora_da_partida' });
    expect(await db.select().from(lances)).toHaveLength(4);
  });

  it('correção que vira empate guarda a moeda que veio; a que desfaz o empate apaga', async () => {
    const c = await cenario();
    await receberEnvio(db, limparEnvio({ data: HOJE, partidas: [partida(c)] })!);
    const empate = [
      { jogadorId: c.a1, tipo: 'gol', tempoMs: 60_000 },
      { jogadorId: c.l1, tipo: 'gol', tempoMs: 5 * MIN },
    ];
    await receberEnvio(db, limparEnvio({ data: HOJE, partidas: [partida(c, { substituir: true, desempate: 'B', lances: empate })] })!);
    expect((await db.select().from(partidas))[0]).toMatchObject({ resultado: 'empate', desempate: 'B' });
    await receberEnvio(db, limparEnvio({ data: HOJE, partidas: [partida(c, { substituir: true, desempate: 'B', lances: empate.slice(0, 1) })] })!);
    expect((await db.select().from(partidas))[0]).toMatchObject({ resultado: 'A', desempate: null });
  });

  it('empate guarda a moeda; goleiro e quem completa entram na foto', async () => {
    const c = await cenario();
    const empate = partida(c, {
      desempate: 'B',
      goleiros: { A: c.gil, B: null },
      lances: [
        { jogadorId: c.gil, tipo: 'gol', tempoMs: 1000 },
        { jogadorId: c.l2, tipo: 'gol', tempoMs: 2000 },
      ],
    });
    expect((await receberEnvio(db, limparEnvio({ data: HOJE, partidas: [empate] })!))![0].situacao).toBe('gravada');
    const [p] = await db.select().from(partidas);
    expect(p).toMatchObject({ resultado: 'empate', desempate: 'B' });
    const [gk] = await db.select().from(partidaJogadores).where(eq(partidaJogadores.jogadorId, c.gil));
    expect(gk).toMatchObject({ lado: 'A', goleiro: true });
  });

  it('quem faltou fica fora da foto e abre uma vaga para quem completa', async () => {
    const c = await cenario();
    // Bia (a2) não veio; Gil joga no lugar dela, num time sem COMPLETE.
    const lances = [{ jogadorId: c.gil, tipo: 'gol', tempoMs: 60_000 }];
    const envio = limparEnvio({ data: HOJE, partidas: [partida(c, { ausentes: { A: [c.a2], B: [] }, completam: { A: [c.gil], B: [] }, lances })] })!;
    const [r] = (await receberEnvio(db, envio))!;
    expect(r.situacao).toBe('gravada');
    const foto = await db.select().from(partidaJogadores).where(eq(partidaJogadores.partidaId, (r as { id: number }).id));
    expect(foto.map((f) => f.jogadorId).sort()).toEqual([c.a1, c.l1, c.l2, c.gil].sort());
    expect(foto.find((f) => f.jogadorId === c.gil)).toMatchObject({ lado: 'A', completando: true });
  });

  it('falta de quem não é do time, falta repetida, lance de quem faltou e completar sem vaga são recusados', async () => {
    const c = await cenario();
    const tenta = async (extra: Record<string, unknown>, origem: string) => {
      const [r] = (await receberEnvio(db, limparEnvio({ data: HOJE, partidas: [partida(c, { origem, ...extra })] })!))!;
      return r.situacao === 'recusada' ? r.motivo : r.situacao;
    };
    expect(await tenta({ ausentes: { A: [c.l1], B: [] } }, 'app-0002-aaaa')).toBe('ausente_invalido');
    expect(await tenta({ ausentes: { A: [c.a2, c.a2], B: [] } }, 'app-0003-aaaa')).toBe('ausente_invalido');
    // O lance de Bia (a2) continua no envio, mas ela faltou.
    expect(await tenta({ ausentes: { A: [c.a2], B: [] } }, 'app-0004-aaaa')).toBe('fora_da_partida');
    expect(await tenta({ completam: { A: [c.gil], B: [] } }, 'app-0005-aaaa')).toBe('completes_demais');
    expect(limparEnvio({ data: HOJE, partidas: [partida(c, { ausentes: { A: ['x'], B: [] } })] })).toBeNull();
  });

  it('uma partida recusada não impede as outras, e diz o motivo', async () => {
    const c = await cenario();
    const envio = limparEnvio({
      data: HOJE,
      partidas: [
        partida(c, { origem: 'app-0001-fora', lances: [{ jogadorId: c.v1, tipo: 'gol', tempoMs: 0 }] }),
        partida(c, { origem: 'app-0002-time', timeBId: 99_999 }),
        partida(c, { origem: 'app-0003-hora', iniciadaEm: '2026-11-12T20:40:00-03:00', encerradaEm: '2026-11-12T20:48:00-03:00' }),
        partida(c, { origem: 'app-0004-boa', timeAId: c.preto, timeBId: c.verde, lances: [] }),
      ],
    })!;
    expect(await receberEnvio(db, envio)).toEqual([
      { origem: 'app-0001-fora', situacao: 'recusada', motivo: 'fora_da_partida' },
      { origem: 'app-0002-time', situacao: 'recusada', motivo: 'time_inexistente' },
      { origem: 'app-0003-hora', situacao: 'recusada', motivo: 'horario_invalido' },
      { origem: 'app-0004-boa', situacao: 'gravada', id: expect.any(Number) },
    ]);
    expect(await db.select().from(partidas)).toHaveLength(1);
  });

  it('convive com uma partida aberta pelo site', async () => {
    const c = await cenario();
    await iniciarPartida(db, c.peladaId, c.branco, c.verde, NOITE);
    const r = await receberEnvio(db, limparEnvio({ data: HOJE, partidas: [partida(c, { timeAId: c.preto, timeBId: c.verde, lances: [] })] })!);
    expect(r![0].situacao).toBe('gravada');
  });

  it('sem pelada nessa data: null', async () => {
    const c = await cenario();
    expect(await receberEnvio(db, limparEnvio({ data: '2026-11-18', partidas: [partida(c)] })!)).toBeNull();
  });
});

describe('lerParaAnotar', () => {
  it('traz os times, os jogadores ativos e as partidas já encerradas, na ordem', async () => {
    const c = await cenario();
    const id = await iniciarPartida(db, c.peladaId, c.branco, c.preto, NOITE);
    await encerrarPartida(db, id, new Date(NOITE.getTime() + 8 * MIN));
    await receberEnvio(db, limparEnvio({ data: HOJE, partidas: [partida(c, { timeAId: c.preto, timeBId: c.verde, iniciadaEm: depois(10 * MIN), encerradaEm: depois(18 * MIN), lances: [] })] })!);
    const d = (await lerParaAnotar(db, HOJE))!;
    expect(d.peladaId).toBe(c.peladaId);
    expect(d.cancelada).toBe(false);
    expect(d.times.map((t) => [t.id, t.jogadores.length, t.vagas])).toEqual([
      [c.branco, 2, 0],
      [c.preto, 2, 0],
      [c.verde, 2, 0],
    ]);
    expect(d.jogadores).toHaveLength(7);
    expect(d.jogadores.find((j) => j.nome === 'Gil')?.agarra).toBe(true);
    expect(d.partidas).toEqual([
      { timeAId: c.branco, timeBId: c.preto, resultado: 'empate', desempate: null, origem: null },
      { timeAId: c.preto, timeBId: c.verde, resultado: 'empate', desempate: null, origem: 'app-0001-aaaa' },
    ]);
  });

  it('avisa quando a pelada foi cancelada', async () => {
    const c = await cenario();
    await db.update(peladas).set({ estadoManual: 'cancelada' }).where(eq(peladas.id, c.peladaId));
    expect((await lerParaAnotar(db, HOJE))!.cancelada).toBe(true);
  });

  it('sem pelada, ou data malformada: null', async () => {
    await cenario();
    expect(await lerParaAnotar(db, '2026-11-18')).toBeNull();
    expect(await lerParaAnotar(db, 'hoje')).toBeNull();
  });
});
