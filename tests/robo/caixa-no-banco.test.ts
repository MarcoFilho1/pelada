import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { avisoDoMerge, CaixaNoBanco, type ResultadoDaRevisao } from '@/robo/revisao';
import { anotarNoDiario, gravarRecado, lerDiario, lerRecado, limparDiarioDoBanco, tirarRecado } from '@/server/ponte-do-robo';
import { createTestDb } from '../helpers/db';

const AGORA = new Date('2026-11-24T23:30:00-03:00');
const COM_PR: ResultadoDaRevisao = { quando: '2026-11-24T23:20:00-03:00', status: 'pr', pr: 70, url: 'https://github.com/x/y/pull/70', problemas: [{ vi: 'O aviso saiu em bloco.', corrigi: 'Agora sai em partes.' }] };

let db: DB;
let agora: Date;
let caixa: CaixaNoBanco;
beforeEach(async () => {
  db = await createTestDb();
  agora = AGORA;
  caixa = new CaixaNoBanco(db, () => agora);
});
const por = (nome: string, v: unknown) => gravarRecado(db, nome, typeof v === 'string' ? v : JSON.stringify(v), AGORA);

describe('CaixaNoBanco', () => {
  it('sem recado, nada novo', async () => {
    expect(await caixa.novoResultado()).toBeNull();
    expect(await caixa.resultadoDoMerge()).toBeNull();
    expect(await caixa.comecarMerge()).toBeNull();
  });

  it('resultado "nada" é consumido e não deixa pendente', async () => {
    await por('resultado', { quando: 'x', status: 'nada' });
    expect((await caixa.novoResultado())?.status).toBe('nada');
    expect(await caixa.novoResultado()).toBeNull();
    expect(await lerRecado(db, 'pendente')).toBeNull();
  });

  it('resultado com PR fica pendente; o "pode mergear" vira um pedido para o Mac', async () => {
    await por('resultado', COM_PR);
    expect(await caixa.novoResultado()).toEqual(COM_PR);
    expect(await caixa.comecarMerge()).toBe(70);
    expect(JSON.parse((await lerRecado(db, 'pedido'))!).pr).toBe(70);
    expect(await lerRecado(db, 'pendente')).toBeNull();
    // Um segundo "pode mergear" não pede de novo.
    expect(await caixa.comecarMerge()).toBeNull();
  });

  it('resultado ilegível vira "falhou", sem deixar pendente', async () => {
    await por('resultado', '{"status":"pr"}');
    const r = await caixa.novoResultado();
    expect(r?.status).toBe('falhou');
    expect(await lerRecado(db, 'pendente')).toBeNull();
  });

  it('aviso que não saiu volta e é lido de novo', async () => {
    await por('resultado', COM_PR);
    const r = (await caixa.novoResultado())!;
    await caixa.devolverResultado(r);
    expect(await caixa.novoResultado()).toEqual(COM_PR);
  });

  it('o fim do merge é lido uma vez e encerra a espera', async () => {
    await por('resultado', COM_PR);
    await caixa.novoResultado();
    await caixa.comecarMerge();
    expect(await caixa.resultadoDoMerge()).toBeNull(); // ainda juntando
    await por('merge', { quando: 'x', status: 'ok', pr: 70 });
    expect(await caixa.resultadoDoMerge()).toEqual({ quando: 'x', status: 'ok', pr: 70 });
    expect(await caixa.resultadoDoMerge()).toBeNull();
    expect(await lerRecado(db, 'mergeando')).toBeNull();
  });

  it('merge que não respondeu em 30 min: avisa que falhou e retira o pedido', async () => {
    await por('resultado', COM_PR);
    await caixa.novoResultado();
    await caixa.comecarMerge();
    agora = new Date(AGORA.getTime() + 31 * 60_000);
    expect(await caixa.resultadoDoMerge()).toMatchObject({ status: 'falhou', pr: 70, motivo: 'o merge não respondeu em 30 min' });
    expect(await lerRecado(db, 'pedido')).toBeNull();
  });
});

describe('avisoDoMerge no celular', () => {
  it('diz que a correção chega pela atualização, não que já está no ar', () => {
    expect(avisoDoMerge({ quando: '', status: 'ok', pr: 70 }, true)).toBe('✅ PR #70 juntado. A correção chega ao celular sozinha, na próxima busca por atualização.');
    expect(avisoDoMerge({ quando: '', status: 'falhou', pr: 70, motivo: 'os testes falharam' }, true)).toBe('⚠️ Não juntei o PR #70: os testes falharam. Nada mudou.');
  });
});

describe('diário e recados no banco', () => {
  it('lê só o tipo e o período pedidos, na ordem em que aconteceu', async () => {
    const t = (min: number) => new Date(AGORA.getTime() + min * 60_000);
    await anotarNoDiario(db, 'log', 'segunda', t(2));
    await anotarNoDiario(db, 'log', 'primeira', t(1));
    await anotarNoDiario(db, 'conversa', '{"recebido":"lista"}', t(1));
    await anotarNoDiario(db, 'log', 'de outro dia', t(60 * 30));
    expect((await lerDiario(db, 'log', t(0), t(60))).map((l) => l.dados)).toEqual(['primeira', 'segunda']);
    expect((await lerDiario(db, 'conversa', t(0), t(60))).map((l) => l.dados)).toEqual(['{"recebido":"lista"}']);
  });

  it('linha de registro grande demais é cortada; limpeza apaga o que passou de 7 dias', async () => {
    await anotarNoDiario(db, 'log', 'x'.repeat(5_000), new Date(AGORA.getTime() - 8 * 24 * 3600_000));
    await anotarNoDiario(db, 'log', 'recente', AGORA);
    const todas = await lerDiario(db, 'log', new Date(0), new Date(AGORA.getTime() + 1));
    expect(todas[0].dados).toHaveLength(2_000);
    expect(await limparDiarioDoBanco(db, AGORA)).toBe(1);
    expect((await lerDiario(db, 'log', new Date(0), new Date(AGORA.getTime() + 1))).map((l) => l.dados)).toEqual(['recente']);
  });

  it('tirar lê e apaga; gravar de novo substitui', async () => {
    await por('pedido', { pr: 1 });
    await por('pedido', { pr: 2 });
    expect(JSON.parse((await tirarRecado(db, 'pedido'))!).pr).toBe(2);
    expect(await tirarRecado(db, 'pedido')).toBeNull();
  });
});
