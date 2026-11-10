import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores, mensalistasMes, peladas, presencas } from '@/db/schema';
import { aberturaLista } from '@/domain/tempo';
import { definirMensalistas } from '@/server/mensalistas';
import { definirEstadoManual, obterPeladaDaSemana } from '@/server/pelada';
import {
  adminAdicionar,
  adminConfirmar,
  adminRemover,
  confirmar,
  entrarNaFila,
  estadoDaSemana,
  remover,
} from '@/server/presencas';
import { createTestDb } from '../helpers/db';

// Semana da quarta 11/11/2026: abre segunda 09/11 00:00, prazo quarta 14:00, jogo 20:30–22:30.
const QUARTA = '2026-11-11';
const DOMINGO = new Date('2026-11-08T12:00:00-03:00');
const SEGUNDA = new Date('2026-11-09T10:00:00-03:00');
const TERCA = new Date('2026-11-10T10:00:00-03:00');
const QUARTA_MANHA = new Date('2026-11-11T09:00:00-03:00');
const QUARTA_TARDE = new Date('2026-11-11T15:00:00-03:00');
const QUARTA_JOGO = new Date('2026-11-11T21:00:00-03:00');

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

/** 16 mensalistas em novembro (lista principal cheia) e `d` diaristas cadastrados. */
async function cenarioCheio(d = 2) {
  const ms = await criar(nomes('M', 16));
  const ds = await criar(nomes('D', d));
  await definirMensalistas(db, '2026-11', ms);
  return { ms, ds };
}

const idsDe = (itens: { jogadorId: number }[]) => itens.map((i) => i.jogadorId);

beforeEach(async () => {
  db = await createTestDb();
});

describe('obterPeladaDaSemana', () => {
  it('chamada duas vezes cria só uma pelada e uma presença M/pendente por mensalista', async () => {
    const { ms } = await cenarioCheio(0);
    const a = await obterPeladaDaSemana(db, SEGUNDA);
    const b = await obterPeladaDaSemana(db, TERCA);
    expect(b).toEqual(a);
    expect(a).toMatchObject({ data: QUARTA, estadoManual: null });
    expect(await db.select().from(peladas)).toHaveLength(1);
    const ps = await db.select().from(presencas);
    expect(ps).toHaveLength(16);
    expect(new Set(ps.map((p) => p.jogadorId))).toEqual(new Set(ms));
    for (const p of ps) {
      expect(p).toMatchObject({ peladaId: a.id, tipo: 'M', status: 'pendente' });
      expect(p.entrouEm.getTime()).toBe(aberturaLista(QUARTA).getTime());
    }
  });

  it('chamadas simultâneas também criam uma pelada só', async () => {
    await cenarioCheio(0);
    const [a, b] = await Promise.all([obterPeladaDaSemana(db, SEGUNDA), obterPeladaDaSemana(db, SEGUNDA)]);
    expect(a.id).toBe(b.id);
    expect(await db.select().from(presencas)).toHaveLength(16);
  });

  it('usa os mensalistas do mês da quarta, não do mês de hoje', async () => {
    // Segunda 30/11 → quarta 02/12: valem os mensalistas de dezembro.
    const [nov, dez] = await criar(['Novembro', 'Dezembro']);
    await definirMensalistas(db, '2026-11', [nov]);
    await definirMensalistas(db, '2026-12', [dez]);
    const p = await obterPeladaDaSemana(db, new Date('2026-11-30T10:00:00-03:00'));
    expect(p.data).toBe('2026-12-02');
    expect((await db.select().from(presencas)).map((x) => x.jogadorId)).toEqual([dez]);
  });

  it('mensalistas entram em ordem de nome (ordem estável na lista)', async () => {
    const ids = await criar(['Zeca', 'Ana', 'Mário', 'bruno']);
    await definirMensalistas(db, '2026-11', ids);
    const estado = await estadoDaSemana(db, SEGUNDA);
    expect(estado.principal.map((i) => i.nome)).toEqual(['Ana', 'bruno', 'Mário', 'Zeca']);
  });

  it('mensalistas salvos depois que a pelada existe não mexem nas presenças da semana', async () => {
    const [a, b] = await criar(['Ana', 'Bia']);
    await definirMensalistas(db, '2026-11', [a]);
    await obterPeladaDaSemana(db, SEGUNDA);
    await definirMensalistas(db, '2026-11', [b]);
    await obterPeladaDaSemana(db, TERCA);
    expect((await db.select().from(presencas)).map((x) => x.jogadorId)).toEqual([a]);
  });
});

describe('estadoDaSemana', () => {
  it('antes de segunda 00:00 não cria a pelada e mostra a lista fechada e vazia sem mensalistas', async () => {
    const estado = await estadoDaSemana(db, DOMINGO);
    expect(estado).toMatchObject({ peladaId: null, data: QUARTA, aberta: false, cancelada: false, principal: [], fila: [] });
    expect(await db.select().from(peladas)).toHaveLength(0);
  });

  it('antes de segunda 00:00 já mostra os mensalistas do mês como M pendentes, em ordem de nome, sem gravar nada', async () => {
    const [bia, ana, caio] = await criar(['Bia', 'Ana', 'Caio']);
    await definirMensalistas(db, '2026-11', [bia, ana, caio]);
    const estado = await estadoDaSemana(db, DOMINGO);
    expect(estado).toMatchObject({ peladaId: null, aberta: false, fila: [], foraDoPrazo: [] });
    expect(estado.principal).toEqual([
      { jogadorId: ana, nome: 'Ana', tipo: 'M', confirmado: false, marca: 'M' },
      { jogadorId: bia, nome: 'Bia', tipo: 'M', confirmado: false, marca: 'M' },
      { jogadorId: caio, nome: 'Caio', tipo: 'M', confirmado: false, marca: 'M' },
    ]);
    expect(await db.select().from(peladas)).toHaveLength(0);
    expect(await db.select().from(presencas)).toHaveLength(0);
  });

  it('antes de abrir, a prévia acompanha mudanças nos mensalistas e ignora desativados', async () => {
    const [ana, bia, caio] = await criar(['Ana', 'Bia', 'Caio']);
    await definirMensalistas(db, '2026-11', [ana, bia]);
    expect(idsDe((await estadoDaSemana(db, DOMINGO)).principal)).toEqual([ana, bia]);
    await definirMensalistas(db, '2026-11', [bia, caio]);
    await db.update(jogadores).set({ ativo: false }).where(eq(jogadores.id, caio));
    expect(idsDe((await estadoDaSemana(db, DOMINGO)).principal)).toEqual([bia]);
  });

  it('antes de abrir, mês sem mensalistas salvos mostra os do mês anterior sem copiar nada', async () => {
    const [ana] = await criar(['Ana']);
    await definirMensalistas(db, '2026-10', [ana]);
    expect(idsDe((await estadoDaSemana(db, DOMINGO)).principal)).toEqual([ana]);
    const nov = await db.select().from(mensalistasMes).where(eq(mensalistasMes.mes, '2026-11'));
    expect(nov).toHaveLength(0);
  });

  it('jogador desativado some da lista e da fila', async () => {
    const { ms, ds } = await cenarioCheio(2);
    await entrarNaFila(db, ds[0], SEGUNDA);
    await entrarNaFila(db, ds[1], SEGUNDA);
    await db.update(jogadores).set({ ativo: false }).where(eq(jogadores.id, ms[0]));
    await db.update(jogadores).set({ ativo: false }).where(eq(jogadores.id, ds[1]));
    const estado = await estadoDaSemana(db, SEGUNDA);
    expect(idsDe(estado.principal)).not.toContain(ms[0]);
    // a vaga do mensalista desativado vai para o primeiro da fila
    expect(idsDe(estado.principal)).toContain(ds[0]);
    expect(estado.fila).toEqual([]);
  });

  it('lista quem perdeu o prazo das 14h', async () => {
    const { ms } = await cenarioCheio(0);
    await confirmar(db, ms[0], SEGUNDA);
    const estado = await estadoDaSemana(db, QUARTA_TARDE);
    expect(idsDe(estado.principal)).toEqual([ms[0]]);
    expect(idsDe(estado.foraDoPrazo)).toEqual(ms.slice(1));
  });
});

describe('confirmar', () => {
  it('diarista na fila não consegue confirmar', async () => {
    const { ds } = await cenarioCheio(1);
    await entrarNaFila(db, ds[0], SEGUNDA);
    await expect(confirmar(db, ds[0], SEGUNDA)).rejects.toMatchObject({ motivo: 'nao_esta_na_lista' });
    const [p] = await db.select().from(presencas).where(eq(presencas.jogadorId, ds[0]));
    expect(p.status).toBe('pendente');
  });

  it('mensalista remove → primeiro diarista sobe pendente e consegue confirmar', async () => {
    const { ms, ds } = await cenarioCheio(2);
    await entrarNaFila(db, ds[0], SEGUNDA);
    await entrarNaFila(db, ds[1], new Date(SEGUNDA.getTime() + 60_000));
    await confirmar(db, ms[0], SEGUNDA);
    await remover(db, ms[1], TERCA);

    let estado = await estadoDaSemana(db, TERCA);
    expect(estado.principal.find((i) => i.jogadorId === ds[0])).toMatchObject({ tipo: 'D', confirmado: false });
    expect(idsDe(estado.fila)).toEqual([ds[1]]);

    await confirmar(db, ds[0], TERCA);
    estado = await estadoDaSemana(db, TERCA);
    expect(estado.principal.find((i) => i.jogadorId === ds[0])?.confirmado).toBe(true);
    expect(estado.principal.find((i) => i.jogadorId === ms[0])?.confirmado).toBe(true);
  });

  it('mensalista depois do prazo não confirma mais', async () => {
    const { ms } = await cenarioCheio(0);
    await obterPeladaDaSemana(db, SEGUNDA);
    await expect(confirmar(db, ms[0], QUARTA_TARDE)).rejects.toMatchObject({ motivo: 'nao_esta_na_lista' });
  });

  it('recusa com a lista fechada, cancelada, antes de abrir ou depois que o jogo começou', async () => {
    const { ms } = await cenarioCheio(0);
    await expect(confirmar(db, ms[0], DOMINGO)).rejects.toMatchObject({ motivo: 'lista_fechada' });
    expect(await db.select().from(peladas)).toHaveLength(0);

    const p = await obterPeladaDaSemana(db, SEGUNDA);
    await definirEstadoManual(db, p.id, 'fechada');
    await expect(confirmar(db, ms[0], SEGUNDA)).rejects.toMatchObject({ motivo: 'lista_fechada' });
    await definirEstadoManual(db, p.id, 'cancelada');
    await expect(confirmar(db, ms[0], SEGUNDA)).rejects.toMatchObject({ motivo: 'lista_cancelada' });
    await definirEstadoManual(db, p.id, null);
    await expect(remover(db, ms[0], QUARTA_JOGO)).rejects.toMatchObject({ motivo: 'jogo_comecou' });
    // aberta à mão pelo admin vale mesmo depois do horário
    await definirEstadoManual(db, p.id, 'aberta');
    await expect(remover(db, ms[0], QUARTA_JOGO)).resolves.toBeUndefined();
  });

  it('confirmar duas vezes não estraga nada: a segunda é recusada', async () => {
    const { ms } = await cenarioCheio(0);
    await confirmar(db, ms[0], SEGUNDA);
    await expect(confirmar(db, ms[0], SEGUNDA)).rejects.toMatchObject({ motivo: 'nao_esta_na_lista' });
  });

  it('dois toques ao mesmo tempo do diarista que sobe e de quem entra na fila: um só fica na vaga', async () => {
    const ms = await criar(nomes('M', 15));
    const [d1, d2] = await criar(['D1', 'D2']);
    await definirMensalistas(db, '2026-11', ms);
    await obterPeladaDaSemana(db, SEGUNDA);
    await Promise.all([entrarNaFila(db, d1, SEGUNDA), entrarNaFila(db, d2, SEGUNDA)]);
    const resultados = await Promise.allSettled([confirmar(db, d1, SEGUNDA), confirmar(db, d2, SEGUNDA)]);
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const estado = await estadoDaSemana(db, SEGUNDA);
    expect(estado.principal.filter((i) => i.tipo === 'D')).toHaveLength(1);
    expect(estado.fila.every((i) => !i.confirmado)).toBe(true);
  });
});

describe('remover', () => {
  it('com a lista fechada o jogador ainda consegue sair; cancelada, não', async () => {
    const { ms } = await cenarioCheio(0);
    const p = await obterPeladaDaSemana(db, SEGUNDA);
    await definirEstadoManual(db, p.id, 'fechada');
    await expect(entrarNaFila(db, ms[0], SEGUNDA)).rejects.toMatchObject({ motivo: 'lista_fechada' });
    await remover(db, ms[0], SEGUNDA);
    await definirEstadoManual(db, p.id, 'cancelada');
    await expect(remover(db, ms[1], SEGUNDA)).rejects.toMatchObject({ motivo: 'lista_cancelada' });
    const linhas = await db.select().from(presencas).where(eq(presencas.status, 'removido'));
    expect(linhas.map((l) => l.jogadorId)).toEqual([ms[0]]);
  });

  it('pelada criada antes de segunda (pelo admin): dá para sair antes de abrir', async () => {
    const { ms } = await cenarioCheio(0);
    await obterPeladaDaSemana(db, DOMINGO);
    await remover(db, ms[0], DOMINGO);
    const [linha] = await db.select().from(presencas).where(eq(presencas.jogadorId, ms[0]));
    expect(linha.status).toBe('removido');
  });

  it('sem pelada criada, antes de abrir: o mensalista da prévia consegue sair (a pelada nasce e ele fica removido)', async () => {
    const { ms } = await cenarioCheio(0);
    await remover(db, ms[0], DOMINGO);
    expect(await db.select().from(peladas)).toHaveLength(1);
    const [linha] = await db.select().from(presencas).where(eq(presencas.jogadorId, ms[0]));
    expect(linha.status).toBe('removido');
    const estado = await estadoDaSemana(db, DOMINGO);
    expect(estado.principal).toHaveLength(15);
    expect(idsDe(estado.principal)).not.toContain(ms[0]);
  });

  it('marca removido (mensalista ou diarista) e é idempotente', async () => {
    const { ms, ds } = await cenarioCheio(1);
    await entrarNaFila(db, ds[0], SEGUNDA);
    await remover(db, ms[0], SEGUNDA);
    await remover(db, ms[0], SEGUNDA);
    await remover(db, ds[0], SEGUNDA);
    const linhas = await db.select().from(presencas).where(eq(presencas.status, 'removido'));
    expect(new Set(linhas.map((l) => l.jogadorId))).toEqual(new Set([ms[0], ds[0]]));
  });
});

describe('entrarNaFila', () => {
  it('mensalista que perdeu o prazo entra no fim da fila como D, na mesma linha', async () => {
    const { ms, ds } = await cenarioCheio(1);
    await entrarNaFila(db, ds[0], SEGUNDA);
    // ninguém confirmou: depois das 14h os 16 mensalistas pendentes saem
    await confirmar(db, ms[1], SEGUNDA);
    await entrarNaFila(db, ms[0], QUARTA_TARDE);

    const estado = await estadoDaSemana(db, QUARTA_TARDE);
    expect(idsDe(estado.principal)).toEqual([ms[1], ds[0], ms[0]]);
    expect(estado.principal[2]).toMatchObject({ tipo: 'D', confirmado: false });
    const linhas = await db.select().from(presencas).where(eq(presencas.jogadorId, ms[0]));
    expect(linhas).toHaveLength(1);
    expect(linhas[0].entrouEm.getTime()).toBe(QUARTA_TARDE.getTime());
  });

  it('mensalista que perdeu o prazo vai pro fim da fila quando a lista está cheia', async () => {
    const { ms } = await cenarioCheio(0);
    const ds = await criar(nomes('D', 16));
    await obterPeladaDaSemana(db, SEGUNDA);
    for (const d of ds) await entrarNaFila(db, d, SEGUNDA);
    await entrarNaFila(db, ms[0], QUARTA_TARDE);
    const estado = await estadoDaSemana(db, QUARTA_TARDE);
    expect(estado.fila.at(-1)).toMatchObject({ jogadorId: ms[0], tipo: 'D' });
  });

  it('quem saiu e volta reaproveita a linha e vai pro fim da fila', async () => {
    const { ds } = await cenarioCheio(2);
    await entrarNaFila(db, ds[0], SEGUNDA);
    await entrarNaFila(db, ds[1], new Date(SEGUNDA.getTime() + 1000));
    await remover(db, ds[0], TERCA);
    await entrarNaFila(db, ds[0], QUARTA_MANHA);
    const estado = await estadoDaSemana(db, QUARTA_MANHA);
    expect(idsDe(estado.fila)).toEqual([ds[1], ds[0]]);
    expect(await db.select().from(presencas).where(eq(presencas.jogadorId, ds[0]))).toHaveLength(1);
  });

  it('mensalista que removeu antes do prazo e volta entra como D', async () => {
    const { ms } = await cenarioCheio(0);
    await remover(db, ms[0], SEGUNDA);
    await entrarNaFila(db, ms[0], TERCA);
    const [p] = await db.select().from(presencas).where(eq(presencas.jogadorId, ms[0]));
    expect(p).toMatchObject({ tipo: 'D', status: 'pendente' });
  });

  it('mensalista que sai e volta com vaga entra direto na lista com a marca M', async () => {
    const [ana, bia] = await criar(['Ana', 'Bia']);
    await definirMensalistas(db, '2026-11', [ana, bia]);
    await remover(db, ana, SEGUNDA);
    await entrarNaFila(db, ana, TERCA);
    const estado = await estadoDaSemana(db, TERCA);
    expect(estado.principal.find((i) => i.jogadorId === ana)).toMatchObject({ marca: 'M', tipo: 'D' });
    expect(estado.principal.find((i) => i.jogadorId === bia)).toMatchObject({ marca: 'M', tipo: 'M' });
  });

  it('mensalista que sai e volta sem vaga vai pra fila com a marca M, sem tirar quem subiu', async () => {
    const { ms, ds } = await cenarioCheio(1);
    await entrarNaFila(db, ds[0], SEGUNDA);
    await remover(db, ms[0], SEGUNDA);
    await entrarNaFila(db, ms[0], TERCA);
    const estado = await estadoDaSemana(db, TERCA);
    expect(idsDe(estado.principal)).toContain(ds[0]);
    expect(estado.fila).toEqual([expect.objectContaining({ jogadorId: ms[0], marca: 'M' })]);
  });

  it('mensalista que voltou não perde a vaga no prazo das 14h', async () => {
    const [ana] = await criar(['Ana']);
    await definirMensalistas(db, '2026-11', [ana]);
    await remover(db, ana, SEGUNDA);
    await entrarNaFila(db, ana, TERCA);
    const estado = await estadoDaSemana(db, QUARTA_TARDE);
    expect(idsDe(estado.principal)).toContain(ana);
    expect(estado.foraDoPrazo).toEqual([]);
  });

  it('diarista continua com a marca D', async () => {
    const { ds } = await cenarioCheio(1);
    await entrarNaFila(db, ds[0], SEGUNDA);
    const estado = await estadoDaSemana(db, SEGUNDA);
    expect(estado.fila[0]).toMatchObject({ jogadorId: ds[0], marca: 'D' });
  });

  it('quem já está na lista ou na fila recebe ja_na_lista', async () => {
    const { ms, ds } = await cenarioCheio(1);
    await entrarNaFila(db, ds[0], SEGUNDA);
    await expect(entrarNaFila(db, ds[0], SEGUNDA)).rejects.toMatchObject({ motivo: 'ja_na_lista' });
    await expect(entrarNaFila(db, ms[0], SEGUNDA)).rejects.toMatchObject({ motivo: 'ja_na_lista' });
  });
});

describe('admin', () => {
  it('com 16 mensalistas na lista, o mensalista marcado depois entra como D na fila (não some)', async () => {
    const { ms } = await cenarioCheio(0);
    const [b] = await criar(['Bruno']);
    const p = await obterPeladaDaSemana(db, SEGUNDA);
    await db.insert(mensalistasMes).values({ mes: '2026-11', jogadorId: b });
    await adminAdicionar(db, p.id, b, TERCA);
    const estado = await estadoDaSemana(db, TERCA);
    expect(idsDe(estado.principal)).toEqual(expect.arrayContaining(ms));
    expect(estado.fila).toEqual([expect.objectContaining({ jogadorId: b, tipo: 'D' })]);
    await expect(entrarNaFila(db, b, TERCA)).rejects.toMatchObject({ motivo: 'ja_na_lista' });
  });

  it('mensalista que saiu e é re-adicionado volta como D no fim da fila: o diarista confirmado fica na vaga', async () => {
    const { ms, ds } = await cenarioCheio(2);
    await entrarNaFila(db, ds[0], SEGUNDA);
    await entrarNaFila(db, ds[1], new Date(SEGUNDA.getTime() + 1000));
    await remover(db, ms[0], SEGUNDA);
    await confirmar(db, ds[0], SEGUNDA);
    const p = await obterPeladaDaSemana(db, SEGUNDA);
    await adminAdicionar(db, p.id, ms[0], TERCA);
    const estado = await estadoDaSemana(db, TERCA);
    expect(estado.principal.find((i) => i.jogadorId === ds[0])).toMatchObject({ tipo: 'D', confirmado: true });
    expect(estado.fila.at(-1)).toMatchObject({ jogadorId: ms[0], tipo: 'D' });
    expect(idsDe(estado.fila)).toEqual([ds[1], ms[0]]);
  });

  it('mensalista sem presença, antes do prazo e com vaga livre, entra como M', async () => {
    const ms = await criar(nomes('M', 10));
    const [novo] = await criar(['Novo']);
    await definirMensalistas(db, '2026-11', ms);
    const p = await obterPeladaDaSemana(db, SEGUNDA);
    await db.insert(mensalistasMes).values({ mes: '2026-11', jogadorId: novo });
    await adminAdicionar(db, p.id, novo, TERCA);
    const estado = await estadoDaSemana(db, TERCA);
    expect(estado.principal.find((i) => i.jogadorId === novo)).toMatchObject({ tipo: 'M', confirmado: false });
  });

  it('mensalista sem presença entra como D se como M tiraria um diarista confirmado da lista', async () => {
    const ms = await criar(nomes('M', 15));
    const [d, novo] = await criar(['Diarista', 'Novo']);
    await definirMensalistas(db, '2026-11', ms);
    const p = await obterPeladaDaSemana(db, SEGUNDA);
    await entrarNaFila(db, d, SEGUNDA);
    await confirmar(db, d, SEGUNDA);
    await db.insert(mensalistasMes).values({ mes: '2026-11', jogadorId: novo });
    await adminAdicionar(db, p.id, novo, TERCA);
    const estado = await estadoDaSemana(db, TERCA);
    expect(estado.principal.find((i) => i.jogadorId === d)).toMatchObject({ confirmado: true });
    expect(estado.fila).toEqual([expect.objectContaining({ jogadorId: novo, tipo: 'D' })]);
  });

  it('adiciona qualquer ativo, recusa inativo e quem já está', async () => {
    const { ds } = await cenarioCheio(1);
    const [inativo] = await criar(['Parou'], { ativo: false });
    const p = await obterPeladaDaSemana(db, SEGUNDA);
    await adminAdicionar(db, p.id, ds[0], SEGUNDA);
    await expect(adminAdicionar(db, p.id, ds[0], SEGUNDA)).rejects.toMatchObject({ motivo: 'ja_na_lista' });
    await expect(adminAdicionar(db, p.id, inativo, SEGUNDA)).rejects.toMatchObject({ motivo: 'jogador_inativo' });
    await expect(adminAdicionar(db, p.id, 999_999, SEGUNDA)).rejects.toMatchObject({ motivo: 'jogador_inativo' });
    const estado = await estadoDaSemana(db, SEGUNDA);
    expect(idsDe(estado.fila)).toEqual([ds[0]]);
  });

  it('mensalista marcado depois da criação entra como M se ainda é antes do prazo', async () => {
    const [a, b] = await criar(['Ana', 'Bia']);
    await definirMensalistas(db, '2026-11', [a]);
    const p = await obterPeladaDaSemana(db, SEGUNDA);
    await db.insert(mensalistasMes).values({ mes: '2026-11', jogadorId: b });
    await adminAdicionar(db, p.id, b, TERCA);
    const [linha] = await db
      .select()
      .from(presencas)
      .where(and(eq(presencas.peladaId, p.id), eq(presencas.jogadorId, b)));
    expect(linha).toMatchObject({ tipo: 'M', status: 'pendente' });
  });

  it('funciona com a lista fechada ou cancelada, e confirma/remove por qualquer um', async () => {
    const { ms, ds } = await cenarioCheio(1);
    const p = await obterPeladaDaSemana(db, SEGUNDA);
    await definirEstadoManual(db, p.id, 'fechada');
    await adminRemover(db, p.id, ms[0], SEGUNDA);
    await adminAdicionar(db, p.id, ds[0], SEGUNDA);
    await adminConfirmar(db, p.id, ds[0], SEGUNDA);
    await adminConfirmar(db, p.id, ms[1], SEGUNDA);
    const estado = await estadoDaSemana(db, SEGUNDA);
    expect(estado.aberta).toBe(false);
    expect(idsDe(estado.principal)).not.toContain(ms[0]);
    expect(estado.principal.find((i) => i.jogadorId === ds[0])?.confirmado).toBe(true);
    expect(estado.principal.find((i) => i.jogadorId === ms[1])?.confirmado).toBe(true);
  });

  it('não confirma quem está na fila', async () => {
    const { ds } = await cenarioCheio(1);
    const p = await obterPeladaDaSemana(db, SEGUNDA);
    await adminAdicionar(db, p.id, ds[0], SEGUNDA);
    await expect(adminConfirmar(db, p.id, ds[0], SEGUNDA)).rejects.toMatchObject({ motivo: 'nao_esta_na_lista' });
  });

  it('define e limpa o estado manual; pelada desconhecida dá erro', async () => {
    const p = await obterPeladaDaSemana(db, DOMINGO);
    await definirEstadoManual(db, p.id, 'aberta');
    expect((await estadoDaSemana(db, DOMINGO)).aberta).toBe(true);
    await definirEstadoManual(db, p.id, null);
    expect((await estadoDaSemana(db, DOMINGO)).aberta).toBe(false);
    await expect(definirEstadoManual(db, 999_999, 'fechada')).rejects.toMatchObject({ motivo: 'pelada_inexistente' });
  });
});
