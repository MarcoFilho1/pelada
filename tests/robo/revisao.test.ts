import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { avisoDaRevisao, avisoDoMerge, CaixaDaRevisao, ehPodeMergear, type ResultadoDaRevisao } from '@/robo/revisao';

const AGORA = new Date('2026-11-24T23:30:00-03:00');
const pasta = () => mkdtempSync(join(tmpdir(), 'revisao-'));
const gravar = (p: string, nome: string, v: unknown) => writeFileSync(join(p, nome), typeof v === 'string' ? v : JSON.stringify(v));
const COM_PR: ResultadoDaRevisao = {
  quando: '2026-11-24T23:20:00-03:00',
  status: 'pr',
  pr: 70,
  url: 'https://github.com/x/y/pull/70',
  problemas: [
    { vi: 'O aviso saiu em bloco.', corrigi: 'Agora sai em partes.' },
    { vi: 'Ignorou o Silvio.', corrigi: 'Acha pelo começo do nome.' },
  ],
};

describe('ehPodeMergear', () => {
  it.each(['pode mergear', 'Pode mergear', 'pode   mergear!', ' PODE MERGEAR. '])('"%s" → sim', (t) => expect(ehPodeMergear(t)).toBe(true));
  it.each(['pode mergear o 3?', 'mergear', 'não pode mergear', ''])('"%s" → não', (t) => expect(ehPodeMergear(t)).toBe(false));
});

describe('avisoDaRevisao', () => {
  it('nada a melhorar', () => {
    expect(avisoDaRevisao({ quando: '', status: 'nada' })).toEqual(['🔎 Revisão de hoje: nada a melhorar. Tudo certo por aqui.']);
  });
  it('falhou', () => {
    expect(avisoDaRevisao({ quando: '', status: 'falhou', motivo: 'passou de 45 min' })).toEqual(['⚠️ A revisão de hoje falhou: passou de 45 min.']);
  });
  it('com PR: um resumo, uma parte por problema e o pedido do pode mergear', () => {
    expect(avisoDaRevisao(COM_PR)).toEqual([
      '🔎 Revisão de hoje: achei 2 coisas para melhorar.',
      '1. O que vi: O aviso saiu em bloco.\nComo corrigi: Agora sai em partes.',
      '2. O que vi: Ignorou o Silvio.\nComo corrigi: Acha pelo começo do nome.',
      'PR: https://github.com/x/y/pull/70\n\nSe estiver bom, responda *pode mergear* que eu junto e me atualizo.',
    ]);
  });
  it('com PR de um problema só: singular', () => {
    expect(avisoDaRevisao({ ...COM_PR, problemas: COM_PR.problemas!.slice(0, 1) })[0]).toBe('🔎 Revisão de hoje: achei 1 coisa para melhorar.');
  });
});

describe('avisoDoMerge', () => {
  it('ok e falhou', () => {
    expect(avisoDoMerge({ quando: '', status: 'ok', pr: 70 })).toBe('✅ PR #70 juntado. Estou no ar com a correção.');
    expect(avisoDoMerge({ quando: '', status: 'falhou', pr: 70, motivo: 'os testes falharam' })).toBe('⚠️ Não juntei o PR #70: os testes falharam. Nada mudou.');
  });
});

describe('CaixaDaRevisao', () => {
  it('sem arquivo, nada novo', () => {
    expect(new CaixaDaRevisao(pasta(), () => AGORA).novoResultado()).toBeNull();
  });

  it('resultado "nada" é consumido e não deixa pendente', () => {
    const p = pasta();
    gravar(p, 'resultado.json', { quando: 'x', status: 'nada' });
    const c = new CaixaDaRevisao(p, () => AGORA);
    expect(c.novoResultado()).toEqual({ quando: 'x', status: 'nada' });
    expect(existsSync(join(p, 'resultado.json'))).toBe(false);
    expect(c.comecarMerge()).toBeNull();
  });

  it('resultado com PR vira pendente', () => {
    const p = pasta();
    gravar(p, 'resultado.json', COM_PR);
    const c = new CaixaDaRevisao(p, () => AGORA);
    expect(c.novoResultado()).toEqual(COM_PR);
    expect(existsSync(join(p, 'resultado.json'))).toBe(false);
    expect(JSON.parse(readFileSync(join(p, 'pendente.json'), 'utf8'))).toEqual(COM_PR);
  });

  it('resultado ilegível ou sem status vira "falhou"', () => {
    for (const lixo of ['{quebrado', { status: 'talvez' }, { status: 'pr' }]) {
      const p = pasta();
      gravar(p, 'resultado.json', lixo);
      const r = new CaixaDaRevisao(p, () => AGORA).novoResultado();
      expect(r?.status).toBe('falhou');
      expect(r?.motivo).toBe('o resultado da revisão veio ilegível');
      expect(existsSync(join(p, 'pendente.json'))).toBe(false);
    }
  });

  it('confirmar devolve o resultado ao arquivo se o aviso não saiu', () => {
    const p = pasta();
    gravar(p, 'resultado.json', { quando: 'x', status: 'nada' });
    const c = new CaixaDaRevisao(p, () => AGORA);
    c.devolverResultado(c.novoResultado()!);
    expect(c.novoResultado()).toEqual({ quando: 'x', status: 'nada' });
  });

  it('comecarMerge: com pendente devolve o PR e passa a "mergeando"', () => {
    const p = pasta();
    gravar(p, 'pendente.json', COM_PR);
    const c = new CaixaDaRevisao(p, () => AGORA);
    expect(c.comecarMerge()).toBe(70);
    expect(existsSync(join(p, 'pendente.json'))).toBe(false);
    expect(existsSync(join(p, 'mergeando.json'))).toBe(true);
    expect(c.comecarMerge()).toBeNull();
  });

  it('resultadoDoMerge: consome merge.json e apaga mergeando', () => {
    const p = pasta();
    gravar(p, 'mergeando.json', { pr: 70, desde: AGORA.toISOString() });
    gravar(p, 'merge.json', { quando: 'y', status: 'ok', pr: 70 });
    const c = new CaixaDaRevisao(p, () => AGORA);
    expect(c.resultadoDoMerge()).toEqual({ quando: 'y', status: 'ok', pr: 70 });
    expect(existsSync(join(p, 'merge.json'))).toBe(false);
    expect(existsSync(join(p, 'mergeando.json'))).toBe(false);
    expect(c.resultadoDoMerge()).toBeNull();
  });

  it('merge sem resposta: depois de 30 min avisa; antes, espera', () => {
    const p = pasta();
    gravar(p, 'mergeando.json', { pr: 70, desde: new Date(AGORA.getTime() - 10 * 60_000).toISOString() });
    expect(new CaixaDaRevisao(p, () => AGORA).resultadoDoMerge()).toBeNull();
    gravar(p, 'mergeando.json', { pr: 70, desde: new Date(AGORA.getTime() - 31 * 60_000).toISOString() });
    const r = new CaixaDaRevisao(p, () => AGORA).resultadoDoMerge();
    expect(r).toMatchObject({ status: 'falhou', pr: 70, motivo: 'o merge não respondeu em 30 min' });
    expect(existsSync(join(p, 'mergeando.json'))).toBe(false);
  });
});
