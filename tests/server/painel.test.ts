import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores, mensalistasMes, partidas, peladas, presencas } from '@/db/schema';
import { definirMensalistas } from '@/server/mensalistas';
import { resumoDoPainel } from '@/server/painel';
import { definirEstadoManual, obterPeladaDaSemana } from '@/server/pelada';
import { adminAdicionar, adminConfirmar } from '@/server/presencas';
import { salvarTimesDefinitivos, timesDaPelada } from '@/server/times';
import { createTestDb } from '../helpers/db';

// Semana da quarta 11/11/2026: abre segunda 09/11 00:00, prazo quarta 14:00, jogo 20:30–22:30.
const QUARTA = '2026-11-11';
const DOMINGO = new Date('2026-11-08T12:00:00-03:00');
const SEGUNDA = new Date('2026-11-09T10:00:00-03:00');
const QUARTA_NOITE = new Date('2026-11-11T21:00:00-03:00');

let db: DB;

async function criar(nomes: string[], extra: Partial<typeof jogadores.$inferInsert> = {}): Promise<number[]> {
  const ids: number[] = [];
  for (const nome of nomes) {
    const [j] = await db.insert(jogadores).values({ nome, ...extra }).returning({ id: jogadores.id });
    ids.push(j.id);
  }
  return ids;
}

const nomes = (prefixo: string, n: number) => Array.from({ length: n }, (_, i) => `${prefixo}${String(i + 1).padStart(2, '0')}`);

beforeEach(async () => {
  db = await createTestDb();
});

describe('resumoDoPainel', () => {
  it('domingo antes de abrir, com 15 mensalistas de novembro: lista antes, nada na lista, mensalistas 15, sem sorteio nem partidas, e nada é gravado', async () => {
    await definirMensalistas(db, '2026-11', await criar(nomes('M', 15)));

    const r = await resumoDoPainel(db, DOMINGO);

    expect(r.lista).toEqual({ data: QUARTA, abertura: '2026-11-09', estado: 'antes', confirmados: 0, vagas: 16, naFila: 0 });
    expect(r.mensalistas).toEqual({ mes: '2026-11', marcados: 15, vagas: 16 });
    expect(r.sorteio).toBeNull();
    expect(r.partidas).toBeNull();
    expect(await db.select().from(peladas)).toHaveLength(0);
    expect(await db.select().from(presencas)).toHaveLength(0);
  });

  it('não copia os mensalistas do mês anterior: mostra a prévia sem gravar', async () => {
    // Domingo 29/11 → quarta 02/12: o mês dos mensalistas é dezembro, que ainda não tem registro.
    await definirMensalistas(db, '2026-11', await criar(nomes('M', 4)));

    const r = await resumoDoPainel(db, new Date('2026-11-29T12:00:00-03:00'));

    expect(r.mensalistas).toEqual({ mes: '2026-12', marcados: 4, vagas: 16 });
    expect((await db.select().from(mensalistasMes)).every((m) => m.mes === '2026-11')).toBe(true);
    expect(await db.select().from(peladas)).toHaveLength(0);
  });

  it('segunda já aberta sem pelada criada: lista aberta, sem gravar nada', async () => {
    await definirMensalistas(db, '2026-11', await criar(nomes('M', 3)));

    const r = await resumoDoPainel(db, SEGUNDA);

    expect(r.lista).toMatchObject({ estado: 'aberta', confirmados: 0, naFila: 0 });
    expect(await db.select().from(peladas)).toHaveLength(0);
  });

  it('segunda com 3 confirmados e 2 na fila: lista aberta, confirmados 3, naFila 2', async () => {
    const ms = await criar(nomes('M', 16));
    const ds = await criar(nomes('D', 2));
    await definirMensalistas(db, '2026-11', ms);
    const pelada = await obterPeladaDaSemana(db, SEGUNDA);
    for (const id of ms.slice(0, 3)) await adminConfirmar(db, pelada.id, id, SEGUNDA);
    for (const id of ds) await adminAdicionar(db, pelada.id, id, SEGUNDA);

    const r = await resumoDoPainel(db, SEGUNDA);

    expect(r.lista).toEqual({ data: QUARTA, abertura: '2026-11-09', estado: 'aberta', confirmados: 3, vagas: 16, naFila: 2 });
  });

  it('lista fechada à mão / cancelada: estado fechada / cancelada', async () => {
    const pelada = await obterPeladaDaSemana(db, SEGUNDA);

    await definirEstadoManual(db, pelada.id, 'fechada');
    expect((await resumoDoPainel(db, SEGUNDA)).lista.estado).toBe('fechada');

    await definirEstadoManual(db, pelada.id, 'cancelada');
    expect((await resumoDoPainel(db, SEGUNDA)).lista.estado).toBe('cancelada');
  });

  it('quarta com times salvos, 2 partidas encerradas e 1 em andamento: times definidos, 2 jogadas, a aberta em andamento', async () => {
    const [pelada] = await db.insert(peladas).values({ data: QUARTA }).returning({ id: peladas.id });
    const [a, b, c, d] = await criar(['Ana', 'Bia', 'Caio', 'Davi']);
    await salvarTimesDefinitivos(db, pelada.id, [[a], [b], [c], [d]]);
    const [azul, laranja, verde] = (await timesDaPelada(db, pelada.id)).map((t) => t.id);
    const encerrada = { peladaId: pelada.id, encerradaEm: QUARTA_NOITE, resultado: 'A' as const };
    await db.insert(partidas).values([
      { ...encerrada, timeAId: azul, timeBId: laranja },
      { ...encerrada, timeAId: verde, timeBId: azul },
    ]);
    const [aberta] = await db
      .insert(partidas)
      .values({ peladaId: pelada.id, timeAId: azul, timeBId: laranja })
      .returning({ id: partidas.id });

    const r = await resumoDoPainel(db, QUARTA_NOITE);

    expect(r.sorteio).toEqual({ data: QUARTA, hoje: true, definidos: true, cancelada: false });
    expect(r.partidas).toEqual({ jogadas: 2, emAndamentoId: aberta.id });
  });

  it('quarta sem pelada criada: sorteio e partidas do dia, vazios, sem gravar nada', async () => {
    const r = await resumoDoPainel(db, QUARTA_NOITE);

    expect(r.sorteio).toEqual({ data: QUARTA, hoje: true, definidos: false, cancelada: false });
    expect(r.partidas).toEqual({ jogadas: 0, emAndamentoId: null });
    expect(await db.select().from(peladas)).toHaveLength(0);
  });

  it('fora da quarta: sorteio e partidas da última pelada', async () => {
    await db.insert(peladas).values({ data: '2026-11-04' });

    const r = await resumoDoPainel(db, DOMINGO);

    expect(r.sorteio).toEqual({ data: '2026-11-04', hoje: false, definidos: false, cancelada: false });
    expect(r.partidas).toEqual({ jogadas: 0, emAndamentoId: null });
  });

  it('pelada do dia cancelada: o sorteio diz que foi cancelada', async () => {
    const [pelada] = await db.insert(peladas).values({ data: QUARTA }).returning({ id: peladas.id });
    await definirEstadoManual(db, pelada.id, 'cancelada');

    const r = await resumoDoPainel(db, QUARTA_NOITE);

    expect(r.sorteio).toEqual({ data: QUARTA, hoje: true, definidos: false, cancelada: true });
    expect(r.partidas).toEqual({ jogadas: 0, emAndamentoId: null });
  });

  it('jogadores: conta só ativos; pinPadrao conta quem tem pin_hash nulo', async () => {
    await criar(['Ana', 'Bia']);
    await criar(['Caio'], { pinHash: 'hash' });
    await criar(['Davi'], { ativo: false });

    const r = await resumoDoPainel(db, DOMINGO);

    expect(r.jogadores).toEqual({ ativos: 3, pinPadrao: 2 });
  });
});
