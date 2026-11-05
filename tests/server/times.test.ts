import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores, partidas, peladas, timeCompletes, timeJogadores, times } from '@/db/schema';
import { definirMensalistas } from '@/server/mensalistas';
import { obterPeladaDaSemana, peladaDoDia } from '@/server/pelada';
import { adminAdicionar, adminConfirmar, adminRemover, estadoDaPelada } from '@/server/presencas';
import { encerrarPartida, historicoDaPelada, iniciarPartida, partidaAoVivo, registrarLance } from '@/server/partidas';
import { rankingDoPeriodo } from '@/server/ranking';
import {
  adicionarComplete,
  ErroTimes,
  moverJogador,
  mudarNotaComplete,
  participantesPadrao,
  partidasJogadas,
  preencherComplete,
  removerComplete,
  salvarTimesDefinitivos,
  timesDaPelada,
} from '@/server/times';
import { createTestDb } from '../helpers/db';

// Semana da quarta 11/11/2026.
const SEGUNDA = new Date('2026-11-09T10:00:00-03:00');
const QUARTA_TARDE = new Date('2026-11-11T15:00:00-03:00');
const QUARTA_NOITE = new Date('2026-11-11T23:00:00-03:00'); // depois das 22:30: proximaQuarta já é 18/11

let db: DB;

async function criar(nomes: string[], extra: Partial<typeof jogadores.$inferInsert> = {}): Promise<number[]> {
  const ids: number[] = [];
  for (const nome of nomes) {
    const [j] = await db
      .insert(jogadores)
      .values({ nome, ...extra })
      .returning({ id: jogadores.id });
    ids.push(j.id);
  }
  return ids;
}

async function novaPelada(data: string): Promise<number> {
  const [p] = await db.insert(peladas).values({ data }).returning({ id: peladas.id });
  return p.id;
}

beforeEach(async () => {
  db = await createTestDb();
});

describe('peladaDoDia', () => {
  it('na quarta é a pelada de hoje, mesmo depois das 22:30', async () => {
    const id = await novaPelada('2026-11-11');
    await novaPelada('2026-11-18'); // a da semana seguinte já existe
    expect(await peladaDoDia(db, QUARTA_NOITE)).toMatchObject({
      id,
      data: '2026-11-11',
    });
  });

  it('fora da quarta é a última pelada até hoje, nunca uma futura', async () => {
    await novaPelada('2026-11-04');
    const id = await novaPelada('2026-11-11');
    await novaPelada('2026-11-18');
    const sexta = new Date('2026-11-13T10:00:00-03:00');
    const segunda = new Date('2026-11-16T10:00:00-03:00');
    expect((await peladaDoDia(db, sexta))?.id).toBe(id);
    expect((await peladaDoDia(db, segunda))?.id).toBe(id);
  });

  it('usa o dia de Recife: quarta 23h em Recife ainda é quarta', async () => {
    const id = await novaPelada('2026-11-11');
    expect((await peladaDoDia(db, new Date('2026-11-12T02:00:00Z')))?.id).toBe(id);
  });

  it('fora da quarta, sem pelada até hoje: null (e não cria nada)', async () => {
    await novaPelada('2026-11-18');
    expect(await peladaDoDia(db, new Date('2026-11-13T10:00:00-03:00'))).toBeNull();
    expect(await db.select().from(peladas)).toHaveLength(1);
  });

  it('na quarta sem a pelada de hoje: cria, com os mensalistas, em vez de cair na da semana passada', async () => {
    const passada = await novaPelada('2026-11-04');
    const ms = await criar(['Ana', 'Bia']);
    await definirMensalistas(db, '2026-11', ms);

    const pelada = await peladaDoDia(db, QUARTA_TARDE);
    expect(pelada).toMatchObject({ data: '2026-11-11', estadoManual: null });
    expect(pelada?.id).not.toBe(passada);
    expect((await estadoDaPelada(db, pelada!.id, SEGUNDA)).principal.map((i) => i.jogadorId)).toEqual(ms);
    expect((await peladaDoDia(db, QUARTA_TARDE))?.id).toBe(pelada?.id); // a segunda chamada só lê
  });

  it('quarta depois das 22:30 sem a pelada de hoje: não cria a da semana seguinte', async () => {
    const passada = await novaPelada('2026-11-04');
    expect((await peladaDoDia(db, QUARTA_NOITE))?.id).toBe(passada);
    expect(await db.select().from(peladas)).toHaveLength(1);
  });
});

describe('estadoDaPelada e participantesPadrao', () => {
  it('participantesPadrao só traz os confirmados da lista principal, com a nota em número', async () => {
    const ms = await criar(['Ana', 'Bia', 'Caio']);
    const [d1, d2] = await criar(['Davi', 'Edu'], { nota: '4.5' });
    await definirMensalistas(db, '2026-11', ms);
    const pelada = await obterPeladaDaSemana(db, SEGUNDA);
    await adminConfirmar(db, pelada.id, ms[0], SEGUNDA);
    await adminConfirmar(db, pelada.id, ms[1], SEGUNDA);
    // Caio fica pendente; Davi entra e confirma; Edu entra e sai.
    await adminAdicionar(db, pelada.id, d1, SEGUNDA);
    await adminConfirmar(db, pelada.id, d1, SEGUNDA);
    await adminAdicionar(db, pelada.id, d2, SEGUNDA);
    await adminConfirmar(db, pelada.id, d2, SEGUNDA);
    await adminRemover(db, pelada.id, d2, SEGUNDA);

    const ps = await participantesPadrao(db, pelada.id, SEGUNDA);
    expect(ps).toEqual([
      { id: ms[0], nome: 'Ana', nota: 3 },
      { id: ms[1], nome: 'Bia', nota: 3 },
      { id: d1, nome: 'Davi', nota: 4.5 },
    ]);
  });

  it('confirmado da fila (além das 16 vagas) e jogador desativado ficam de fora', async () => {
    const ms = await criar(Array.from({ length: 16 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`));
    const [d] = await criar(['Davi']);
    await definirMensalistas(db, '2026-11', ms);
    const pelada = await obterPeladaDaSemana(db, SEGUNDA);
    for (const id of ms) await adminConfirmar(db, pelada.id, id, SEGUNDA);
    await adminAdicionar(db, pelada.id, d, SEGUNDA); // fila
    await db.update(jogadores).set({ ativo: false }).where(eq(jogadores.id, ms[0]));

    const estado = await estadoDaPelada(db, pelada.id, SEGUNDA);
    // Com o M01 desativado, Davi sobe para a lista, mas não confirmou.
    expect(estado.principal.map((i) => i.jogadorId)).toContain(d);
    const ids = (await participantesPadrao(db, pelada.id, SEGUNDA)).map((j) => j.id);
    expect(ids).toHaveLength(15);
    expect(ids).not.toContain(ms[0]);
    expect(ids).not.toContain(d);
  });

  it('segue a regra do prazo: mensalista pendente depois das 14h não entra', async () => {
    const ms = await criar(['Ana', 'Bia']);
    await definirMensalistas(db, '2026-11', ms);
    const pelada = await obterPeladaDaSemana(db, SEGUNDA);
    await adminConfirmar(db, pelada.id, ms[0], SEGUNDA);
    expect((await participantesPadrao(db, pelada.id, QUARTA_TARDE)).map((j) => j.id)).toEqual([ms[0]]);
    expect((await estadoDaPelada(db, pelada.id, QUARTA_TARDE)).foraDoPrazo.map((i) => i.jogadorId)).toEqual([ms[1]]);
  });

  it('pelada que não existe: erro conhecido', async () => {
    await expect(estadoDaPelada(db, 999, SEGUNDA)).rejects.toMatchObject({
      motivo: 'pelada_inexistente',
    });
  });
});

describe('salvarTimesDefinitivos e timesDaPelada', () => {
  it('grava os times com as cores na ordem azul, laranja, verde, preto', async () => {
    const peladaId = await novaPelada('2026-11-11');
    const ids = await criar(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    await db.update(jogadores).set({ nota: '4.5' }).where(eq(jogadores.id, ids[0]));
    await salvarTimesDefinitivos(db, peladaId, [
      [ids[0], ids[1]],
      [ids[2], ids[3]],
      [ids[4], ids[5]],
      [ids[6], ids[7]],
    ]);
    const ts = await timesDaPelada(db, peladaId);
    expect(ts.map((t) => [t.cor, t.ordem])).toEqual([
      ['azul', 1],
      ['laranja', 2],
      ['verde', 3],
      ['preto', 4],
    ]);
    expect(ts[0].jogadores).toEqual([
      { id: ids[0], nome: 'A', nota: 4.5 },
      { id: ids[1], nome: 'B', nota: 3 },
    ]);
    expect(ts[3].jogadores.map((j) => j.id)).toEqual([ids[6], ids[7]]);
  });

  it('salvar duas vezes deixa só o segundo conjunto', async () => {
    const peladaId = await novaPelada('2026-11-11');
    const ids = await criar(['A', 'B', 'C', 'D', 'E', 'F']);
    await salvarTimesDefinitivos(db, peladaId, [
      [ids[0], ids[1]],
      [ids[2], ids[3]],
      [ids[4], ids[5]],
    ]);
    await salvarTimesDefinitivos(db, peladaId, [
      [ids[5], ids[0]],
      [ids[1], ids[2]],
    ]);

    const ts = await timesDaPelada(db, peladaId);
    expect(ts).toHaveLength(2);
    expect(ts.map((t) => t.jogadores.map((j) => j.id).sort())).toEqual([[ids[0], ids[5]].sort(), [ids[1], ids[2]].sort()]);
    expect(await db.select().from(times)).toHaveLength(2);
    expect(await db.select().from(timeJogadores)).toHaveLength(4);
  });

  it('não mexe nos times de outra pelada', async () => {
    const passada = await novaPelada('2026-11-04');
    const hoje = await novaPelada('2026-11-11');
    const ids = await criar(['A', 'B']);
    await salvarTimesDefinitivos(db, passada, [[ids[0]], [ids[1]]]);
    await salvarTimesDefinitivos(db, hoje, [[ids[1]], [ids[0]]]);
    expect((await timesDaPelada(db, passada)).map((t) => t.jogadores[0].id)).toEqual([ids[0], ids[1]]);
  });

  it('recusa com partida em andamento e não mexe nos times', async () => {
    const peladaId = await novaPelada('2026-11-11');
    const ids = await criar(['A', 'B']);
    await salvarTimesDefinitivos(db, peladaId, [[ids[0]], [ids[1]]]);
    const [a, b] = await timesDaPelada(db, peladaId);
    await db.insert(partidas).values({ peladaId, timeAId: a.id, timeBId: b.id });

    const erro = await salvarTimesDefinitivos(db, peladaId, [[ids[1]], [ids[0]]]).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroTimes);
    expect(erro).toMatchObject({ motivo: 'partida_em_andamento' });
    expect((await timesDaPelada(db, peladaId)).map((t) => t.jogadores[0].id)).toEqual([ids[0], ids[1]]);
    expect(await partidasJogadas(db, peladaId)).toEqual({
      jogadas: 0,
      emAndamento: true,
    });
  });

  it('depois de partida encerrada arquiva os times antigos e o histórico, o ranking e o ao vivo ficam iguais', async () => {
    const peladaId = await novaPelada('2026-11-11');
    const ids = await criar(['A', 'B', 'C', 'D']);
    await salvarTimesDefinitivos(db, peladaId, [
      [ids[0], ids[1]],
      [ids[2], ids[3]],
    ]);
    const antigos = await timesDaPelada(db, peladaId);
    const partidaId = await iniciarPartida(db, peladaId, antigos[0].id, antigos[1].id, QUARTA_TARDE);
    await registrarLance(db, partidaId, ids[0], 'gol');
    await encerrarPartida(db, partidaId, new Date(QUARTA_TARDE.getTime() + 60_000));
    const periodo = { tipo: 'geral' } as const;
    const rankingAntes = await rankingDoPeriodo(db, periodo);
    expect(rankingAntes.length).toBeGreaterThan(0);

    await salvarTimesDefinitivos(
      db,
      peladaId,
      [
        [ids[0], ids[2]],
        [ids[1], ids[3]],
      ],
      [],
      QUARTA_TARDE,
    );

    const novos = await timesDaPelada(db, peladaId);
    expect(novos).toHaveLength(2);
    expect(novos.map((t) => t.id)).not.toContain(antigos[0].id);
    expect(novos.map((t) => t.jogadores.map((j) => j.id).sort())).toEqual([[ids[0], ids[2]].sort(), [ids[1], ids[3]].sort()]);
    const todos = await db.select().from(times).where(eq(times.peladaId, peladaId));
    expect(
      todos
        .filter((t) => t.arquivadoEm !== null)
        .map((t) => t.id)
        .sort(),
    ).toEqual(antigos.map((t) => t.id).sort());
    expect(todos.find((t) => t.id === antigos[0].id)!.arquivadoEm).toEqual(QUARTA_TARDE);
    expect(await db.select().from(timeJogadores).where(eq(timeJogadores.timeId, antigos[0].id))).toHaveLength(2);

    expect(await rankingDoPeriodo(db, periodo)).toEqual(rankingAntes);
    const hist = await historicoDaPelada(db, peladaId);
    expect(hist.map((h) => [h.timeA.cor, h.timeB.cor])).toEqual([[antigos[0].cor, antigos[1].cor]]);
    const aoVivo = await partidaAoVivo(db, partidaId, QUARTA_TARDE);
    expect([aoVivo!.lados.A.cor, aoVivo!.lados.B.cor]).toEqual([antigos[0].cor, antigos[1].cor]);
    expect(await partidasJogadas(db, peladaId)).toEqual({
      jogadas: 1,
      emAndamento: false,
    });
  });

  it('time arquivado vira time_inexistente em moverJogador e nos COMPLETE', async () => {
    const peladaId = await novaPelada('2026-11-11');
    const ids = await criar(['A', 'B', 'C', 'D']);
    await salvarTimesDefinitivos(db, peladaId, [
      [ids[0], ids[1]],
      [ids[2], ids[3]],
    ]);
    const antigos = await timesDaPelada(db, peladaId);
    const partidaId = await iniciarPartida(db, peladaId, antigos[0].id, antigos[1].id, QUARTA_TARDE);
    await encerrarPartida(db, partidaId, new Date(QUARTA_TARDE.getTime() + 60_000));
    await salvarTimesDefinitivos(db, peladaId, [[ids[0]], [ids[1]]]);

    expect(await moverJogador(db, ids[0], antigos[0].id, null).catch((e) => e.motivo)).toBe('time_inexistente');
    expect(await adicionarComplete(db, antigos[0].id, 3).catch((e) => e.motivo)).toBe('time_inexistente');
  });

  it('guarda os COMPLETE de cada time', async () => {
    const peladaId = await novaPelada('2026-11-11');
    const ids = await criar(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    await salvarTimesDefinitivos(
      db,
      peladaId,
      [
        [ids[0], ids[1], ids[2]],
        [ids[3], ids[4], ids[5], ids[6]],
      ],
      [[3], []],
    );
    const [t1, t2] = await timesDaPelada(db, peladaId);
    expect(t1.completes).toEqual([{ id: expect.any(Number), nota: 3 }]);
    expect(t2.completes).toEqual([]);
    expect(await salvarTimesDefinitivos(db, peladaId, [[ids[0]]], [[5.5]]).catch((e) => e.motivo)).toBe('nota_invalida');
  });

  it('recusa time com mais de 4 entre jogadores e COMPLETE, e COMPLETE de time que não existe', async () => {
    const peladaId = await novaPelada('2026-11-11');
    const ids = await criar(['A', 'B', 'C', 'D']);
    expect(await salvarTimesDefinitivos(db, peladaId, [[ids[0], ids[1], ids[2]]], [[3, 3]]).catch((e) => e.motivo)).toBe('time_cheio');
    expect(await salvarTimesDefinitivos(db, peladaId, [[ids[0], ids[1], ids[2], ids[3]]], [[3]]).catch((e) => e.motivo)).toBe('time_cheio');
    expect(await salvarTimesDefinitivos(db, peladaId, [[ids[0]]], [[], [3]]).catch((e) => e.motivo)).toBe('pedido_invalido');
  });

  it('noite com 17: time só de jogadores não tem limite (5, 4, 4, 4 sem COMPLETE)', async () => {
    const peladaId = await novaPelada('2026-11-11');
    const ids = await criar(Array.from({ length: 17 }, (_, i) => `J${i + 1}`));
    await salvarTimesDefinitivos(db, peladaId, [ids.slice(0, 5), ids.slice(5, 9), ids.slice(9, 13), ids.slice(13)]);
    const ts = await timesDaPelada(db, peladaId);
    expect(ts.map((t) => t.jogadores.length)).toEqual([5, 4, 4, 4]);
    expect(ts.every((t) => t.completes.length === 0)).toBe(true);
  });

  it('sorteio novo sem partida apaga também os COMPLETE antigos', async () => {
    const peladaId = await novaPelada('2026-11-11');
    const ids = await criar(['A', 'B']);
    await salvarTimesDefinitivos(db, peladaId, [[ids[0]], [ids[1]]], [[3], []]);
    await salvarTimesDefinitivos(db, peladaId, [[ids[0]], [ids[1]]]);
    expect(await db.select().from(timeCompletes)).toEqual([]);
    expect(await db.select().from(times)).toHaveLength(2);
  });

  it('recusa jogador repetido, desativado ou inexistente, e quantidade de times fora de 1 a 4', async () => {
    const peladaId = await novaPelada('2026-11-11');
    const ids = await criar(['A', 'B', 'C', 'D', 'E']);
    const [inativo] = await criar(['Zé'], { ativo: false });
    const motivo = (ts: number[][]) => salvarTimesDefinitivos(db, peladaId, ts).catch((e: ErroTimes) => e.motivo);

    expect(
      await motivo([
        [ids[0], ids[1]],
        [ids[1], ids[2]],
      ]),
    ).toBe('jogador_repetido');
    expect(await motivo([[ids[0]], [inativo]])).toBe('jogador_inativo');
    expect(await motivo([[ids[0]], [999_999]])).toBe('jogador_inativo');
    expect(await motivo([])).toBe('quantidade_de_times');
    expect(await motivo([[ids[0]], [ids[1]], [ids[2]], [ids[3]], [ids[4]]])).toBe('quantidade_de_times');
    expect(await motivo([[ids[0]], []])).toBe('time_vazio');
    expect(await motivo([[ids[0]]])).toBeUndefined(); // 1 time vale
    expect(await motivo([[ids[0]], [ids[1]]])).toBeUndefined();
  });

  it('pelada inexistente: erro conhecido', async () => {
    const [a] = await criar(['A']);
    await expect(salvarTimesDefinitivos(db, 999, [[a]])).rejects.toMatchObject({
      motivo: 'pelada_inexistente',
    });
  });

  it('pelada sem times: lista vazia', async () => {
    expect(await timesDaPelada(db, await novaPelada('2026-11-11'))).toEqual([]);
  });
});

describe('moverJogador', () => {
  async function cenario() {
    const peladaId = await novaPelada('2026-11-11');
    const ids = await criar(['A', 'B', 'C', 'D']);
    await salvarTimesDefinitivos(db, peladaId, [
      [ids[0], ids[1]],
      [ids[2], ids[3]],
    ]);
    const [azul, laranja] = await timesDaPelada(db, peladaId);
    return { peladaId, ids, azul: azul.id, laranja: laranja.id };
  }
  const elencos = async (peladaId: number) => (await timesDaPelada(db, peladaId)).map((t) => t.jogadores.map((j) => j.id).sort());

  it('tira de um time e põe em outro', async () => {
    const { peladaId, ids, azul, laranja } = await cenario();
    await moverJogador(db, ids[0], azul, laranja);
    expect(await elencos(peladaId)).toEqual([[ids[1]], [ids[0], ids[2], ids[3]].sort()]);
  });

  it('tira do time (para = null)', async () => {
    const { peladaId, ids, laranja } = await cenario();
    await moverJogador(db, ids[3], laranja, null);
    expect(await elencos(peladaId)).toEqual([[ids[0], ids[1]].sort(), [ids[2]]]);
  });

  it('põe quem estava fora (de = null)', async () => {
    const { peladaId, ids, azul } = await cenario();
    const [novo] = await criar(['Novo']);
    await moverJogador(db, novo, null, azul);
    expect(await elencos(peladaId)).toEqual([[ids[0], ids[1], novo].sort(), [ids[2], ids[3]].sort()]);
  });

  it('um time por jogador por pelada: pôr sem dizer de onde tira do time antigo', async () => {
    const { peladaId, ids, laranja } = await cenario();
    await moverJogador(db, ids[0], null, laranja);
    expect(await elencos(peladaId)).toEqual([[ids[1]], [ids[0], ids[2], ids[3]].sort()]);
  });

  it('o mesmo jogador pode estar num time de outra pelada', async () => {
    const { peladaId, ids, azul } = await cenario();
    const outra = await novaPelada('2026-11-18');
    await salvarTimesDefinitivos(db, outra, [[ids[2]]]);
    await moverJogador(db, ids[2], null, azul);
    expect((await elencos(peladaId))[0]).toContain(ids[2]);
    expect((await elencos(outra))[0]).toEqual([ids[2]]);
  });

  it('recusa pôr jogador desativado num time, mas deixa tirá-lo', async () => {
    const { peladaId, ids, azul, laranja } = await cenario();
    const [inativo] = await criar(['Zé'], { ativo: false });
    await expect(moverJogador(db, inativo, null, azul)).rejects.toMatchObject({
      motivo: 'jogador_inativo',
    });
    await db.update(jogadores).set({ ativo: false }).where(eq(jogadores.id, ids[2]));
    await expect(moverJogador(db, ids[2], laranja, azul)).rejects.toMatchObject({ motivo: 'jogador_inativo' });
    await moverJogador(db, ids[2], laranja, null);
    expect((await elencos(peladaId))[1]).toEqual([ids[3]]);
  });

  it('recusa time inexistente, jogador fora do time de origem e times de peladas diferentes', async () => {
    const { ids, azul, laranja } = await cenario();
    const outra = await novaPelada('2026-11-18');
    await salvarTimesDefinitivos(db, outra, [[ids[0]]]);
    const [timeDaOutra] = await timesDaPelada(db, outra);
    await expect(moverJogador(db, ids[0], azul, 999_999)).rejects.toMatchObject({ motivo: 'time_inexistente' });
    await expect(moverJogador(db, ids[2], azul, laranja)).rejects.toMatchObject({ motivo: 'fora_do_time' });
    await expect(moverJogador(db, ids[1], azul, timeDaOutra.id)).rejects.toMatchObject({ motivo: 'peladas_diferentes' });
    await expect(moverJogador(db, ids[1], null, null)).rejects.toBeInstanceOf(ErroTimes);
  });

  it('mesmo time de origem e destino: não faz nada', async () => {
    const { peladaId, ids, azul } = await cenario();
    await moverJogador(db, ids[0], azul, azul);
    expect((await elencos(peladaId))[0]).toEqual([ids[0], ids[1]].sort());
  });

  it('pôr num time com COMPLETE: o jogador ocupa a vaga de um COMPLETE (o mais antigo)', async () => {
    const { peladaId, ids, azul, laranja } = await cenario();
    const primeiro = await adicionarComplete(db, azul, 2.5);
    const segundo = await adicionarComplete(db, azul, 3.5);
    await moverJogador(db, ids[2], laranja, azul);
    const [a, l] = await timesDaPelada(db, peladaId);
    expect(a.jogadores.map((j) => j.id).sort()).toEqual([ids[0], ids[1], ids[2]].sort());
    expect(a.completes).toEqual([{ id: segundo, nota: 3.5 }]);
    expect(l.jogadores.map((j) => j.id)).toEqual([ids[3]]);
    expect(l.completes).toEqual([]); // sair de um time não cria COMPLETE
    expect(primeiro).toBeLessThan(segundo);
    // quem estava fora também consome
    const [novo] = await criar(['Novo']);
    await moverJogador(db, novo, null, azul);
    expect((await timesDaPelada(db, peladaId))[0].completes).toEqual([]);
  });

  it('pôr num time sem COMPLETE: como antes, sem limite (time de 5 vale)', async () => {
    const peladaId = await novaPelada('2026-11-11');
    const ids = await criar(['A', 'B', 'C', 'D', 'E']);
    await salvarTimesDefinitivos(db, peladaId, [[ids[0], ids[1], ids[2], ids[3]], [ids[4]]], [[], [3]]);
    const [azul, laranja] = await timesDaPelada(db, peladaId);
    const [novo] = await criar(['Novo']);
    await moverJogador(db, novo, null, azul.id);
    const [a, l] = await timesDaPelada(db, peladaId);
    expect(a.jogadores).toHaveLength(5);
    expect(a.completes).toEqual([]);
    expect(l.completes).toHaveLength(1); // o COMPLETE do outro time fica
    expect(laranja.completes).toHaveLength(1);
  });
});

describe('COMPLETE de um time', () => {
  async function montar() {
    const peladaId = await novaPelada('2026-11-11');
    const ids = await criar(['A', 'B', 'C', 'D', 'E', 'F']);
    await salvarTimesDefinitivos(db, peladaId, [[ids[0], ids[1]], [ids[3]]], [[3], [3, 3, 3]]);
    const [t1, t2] = await timesDaPelada(db, peladaId);
    return { peladaId, ids, t1, t2 };
  }

  it('preencherComplete põe o jogador sem time e o COMPLETE some', async () => {
    const { peladaId, ids, t2 } = await montar();
    await preencherComplete(db, t2.completes[0].id, ids[4]);
    const [, novo] = await timesDaPelada(db, peladaId);
    expect(novo.jogadores.map((j) => j.id).sort()).toEqual([ids[3], ids[4]].sort());
    expect(novo.completes).toHaveLength(2);
  });

  it('preencherComplete recusa quem já está noutro time atual e jogador inativo', async () => {
    const { peladaId, ids, t2 } = await montar();
    expect(await preencherComplete(db, t2.completes[0].id, ids[0]).catch((e) => e.motivo)).toBe('ja_tem_time');
    await db.update(jogadores).set({ ativo: false }).where(eq(jogadores.id, ids[5]));
    expect(await preencherComplete(db, t2.completes[0].id, ids[5]).catch((e) => e.motivo)).toBe('jogador_inativo');
    expect((await timesDaPelada(db, peladaId))[1].completes).toHaveLength(3);
  });

  it('adicionarComplete recusa time com 4 e nota inválida; remover e mudar nota funcionam', async () => {
    const { peladaId, t1, t2 } = await montar();
    expect(await adicionarComplete(db, t2.id, 3).catch((e) => e.motivo)).toBe('time_cheio');
    expect(await adicionarComplete(db, t1.id, 2.7).catch((e) => e.motivo)).toBe('nota_invalida');
    const novo = await adicionarComplete(db, t1.id, 2.5);
    await mudarNotaComplete(db, novo, 4);
    expect(await mudarNotaComplete(db, novo, 5.5).catch((e) => e.motivo)).toBe('nota_invalida');
    let [a] = await timesDaPelada(db, peladaId);
    expect(a.completes.map((c) => c.nota).sort()).toEqual([3, 4]);
    await removerComplete(db, novo);
    [a] = await timesDaPelada(db, peladaId);
    expect(a.completes.map((c) => c.nota)).toEqual([3]);
  });
});
