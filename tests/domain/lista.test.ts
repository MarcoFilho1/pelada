import { describe, expect, it } from 'vitest';
import { calcularLista, podeConfirmar, situacaoDoJogador, travaDoJogador, travaParaSair, type EstadoManual, type Presenca } from '@/domain/lista';

const QUARTA = '2026-11-04';
const ANTES_PRAZO = new Date('2026-11-04T13:00:00-03:00');
const PRAZO = new Date('2026-11-04T14:00:00.000-03:00');

let seq = 0;
function p(tipo: 'M' | 'D', o: Partial<Presenca> = {}): Presenca {
  seq += 1;
  return {
    id: seq,
    jogadorId: 100 + seq,
    nome: `${tipo}${seq}`,
    tipo,
    status: 'pendente',
    entrouEm: new Date(Date.UTC(2026, 10, 2, 12, 0, seq)),
    ...o,
  };
}
const entrada = (presencas: Presenca[], now = ANTES_PRAZO, extra = {}) => ({
  presencas,
  dataQuarta: QUARTA,
  estadoManual: null as null,
  now,
  ...extra,
});

describe('calcularLista', () => {
  it('14 mensalistas + 3 diaristas: principal 14 M + 2 D, fila 1 D', () => {
    const ms = Array.from({ length: 14 }, () => p('M'));
    const ds = [p('D'), p('D'), p('D')];
    const r = calcularLista(entrada([...ds, ...ms]));
    expect(r.vagas).toBe(16);
    expect(r.principal.map((i) => i.jogadorId)).toEqual([...ms, ds[0], ds[1]].map((x) => x.jogadorId));
    expect(r.fila.map((i) => i.jogadorId)).toEqual([ds[2].jogadorId]);
  });

  it('mensalista que remove deixa o 1º da fila subir, sem confirmar', () => {
    const ms = Array.from({ length: 16 }, () => p('M'));
    const d = p('D');
    ms[3] = { ...ms[3], status: 'removido' };
    const r = calcularLista(entrada([...ms, d]));
    expect(r.fila).toEqual([]);
    const sobe = r.principal.find((i) => i.jogadorId === d.jogadorId);
    expect(sobe).toEqual({ jogadorId: d.jogadorId, nome: d.nome, tipo: 'D', confirmado: false, marca: 'D' });
    expect(r.principal).toHaveLength(16);
  });

  it('às 14:00:00.000 mensalista pendente sai e o D sobe; confirmado fica', () => {
    const ms = Array.from({ length: 16 }, () => p('M'));
    ms[0] = { ...ms[0], status: 'confirmado' };
    const d = p('D');
    const r = calcularLista(entrada([...ms, d], PRAZO));
    expect(r.principal.some((i) => i.jogadorId === ms[0].jogadorId && i.confirmado)).toBe(true);
    expect(r.principal.some((i) => i.jogadorId === ms[1].jogadorId)).toBe(false);
    expect(r.fila.some((i) => i.jogadorId === ms[1].jogadorId)).toBe(false);
    expect(r.principal.some((i) => i.jogadorId === d.jogadorId)).toBe(true);
    expect(r.principal.filter((i) => i.tipo === 'M')).toHaveLength(1);
  });

  it('1 ms antes do prazo o mensalista pendente ainda está', () => {
    const m = p('M');
    const r = calcularLista(entrada([m], new Date(PRAZO.getTime() - 1)));
    expect(r.principal).toHaveLength(1);
  });

  it('mesmo entrouEm: menor id primeiro (diaristas)', () => {
    const t = new Date('2026-11-02T12:00:00Z');
    const d2 = p('D', { id: 900, entrouEm: t });
    const d1 = p('D', { id: 800, entrouEm: t });
    const r = calcularLista(entrada([d2, d1], ANTES_PRAZO, { vagas: 1 }));
    expect(r.principal[0].jogadorId).toBe(d1.jogadorId);
    expect(r.fila[0].jogadorId).toBe(d2.jogadorId);
  });

  it('mesmo entrouEm: menor id primeiro (mensalistas)', () => {
    const t = new Date('2026-11-02T12:00:00Z');
    const m2 = p('M', { id: 900, entrouEm: t });
    const m1 = p('M', { id: 800, entrouEm: t });
    const r = calcularLista(entrada([m2, m1]));
    expect(r.principal.map((i) => i.jogadorId)).toEqual([m1.jogadorId, m2.jogadorId]);
  });

  it('ordena por entrouEm independentemente da ordem de entrada', () => {
    const tarde = p('D', { entrouEm: new Date('2026-11-03T12:00:00Z') });
    const cedo = p('D', { entrouEm: new Date('2026-11-02T12:00:00Z') });
    const r = calcularLista(entrada([tarde, cedo]));
    expect(r.principal.map((i) => i.jogadorId)).toEqual([cedo.jogadorId, tarde.jogadorId]);
  });

  it('não altera a entrada', () => {
    const lista = [p('D', { entrouEm: new Date('2026-11-03T12:00:00Z') }), p('D'), p('M')];
    const copia = [...lista];
    calcularLista(entrada(lista));
    expect(lista).toEqual(copia);
  });

  it('vagas menor que o número de mensalistas: o mensalista que sobra vai pra frente da fila, ninguém some', () => {
    const ms = [p('M'), p('M'), p('M')];
    const d = p('D');
    const r = calcularLista(entrada([...ms, d], ANTES_PRAZO, { vagas: 2 }));
    expect(r.principal.map((i) => i.jogadorId)).toEqual([ms[0].jogadorId, ms[1].jogadorId]);
    expect(r.fila.map((i) => i.jogadorId)).toEqual([ms[2].jogadorId, d.jogadorId]);
  });

  it('17 mensalistas: 16 na lista e o 17º na frente da fila', () => {
    const ms = Array.from({ length: 17 }, () => p('M'));
    const d = p('D');
    const r = calcularLista(entrada([d, ...ms]));
    expect(r.principal.map((i) => i.jogadorId)).toEqual(ms.slice(0, 16).map((m) => m.jogadorId));
    expect(r.fila.map((i) => i.jogadorId)).toEqual([ms[16].jogadorId, d.jogadorId]);
    expect(r.fila[0]).toMatchObject({ tipo: 'M', confirmado: false });
  });

  it('sem presenças: listas vazias', () => {
    const r = calcularLista(entrada([]));
    expect(r.principal).toEqual([]);
    expect(r.fila).toEqual([]);
  });

  it('diarista removido não aparece em lugar nenhum', () => {
    const d = p('D', { status: 'removido' });
    const r = calcularLista(entrada([d]));
    expect(r.principal).toEqual([]);
    expect(r.fila).toEqual([]);
  });

  it('confirmado reflete o status', () => {
    const r = calcularLista(entrada([p('D', { status: 'confirmado' })]));
    expect(r.principal[0].confirmado).toBe(true);
  });

  describe('aberta / cancelada', () => {
    const abre = (now: string, estadoManual: 'aberta' | 'fechada' | 'cancelada' | null) =>
      calcularLista({ presencas: [], dataQuarta: QUARTA, estadoManual, now: new Date(now) });

    it('cancelada manual', () => {
      const r = abre('2026-11-04T10:00:00-03:00', 'cancelada');
      expect(r.cancelada).toBe(true);
      expect(r.aberta).toBe(false);
    });
    it('automática: fechada antes de segunda 00:00, aberta a partir dela', () => {
      expect(abre('2026-11-01T23:59:59-03:00', null).aberta).toBe(false);
      expect(abre('2026-11-02T00:00:00-03:00', null).aberta).toBe(true);
    });
    it('automática: aberta até 22:30 de quarta (exclusivo)', () => {
      expect(abre('2026-11-04T22:29:59-03:00', null).aberta).toBe(true);
      expect(abre('2026-11-04T22:30:00-03:00', null).aberta).toBe(false);
    });
    it('manual aberta vale fora da janela; fechada fecha dentro dela', () => {
      expect(abre('2026-10-30T10:00:00-03:00', 'aberta').aberta).toBe(true);
      expect(abre('2026-11-03T10:00:00-03:00', 'fechada').aberta).toBe(false);
    });
    it('não cancelada nos demais casos', () => {
      expect(abre('2026-11-03T10:00:00-03:00', null).cancelada).toBe(false);
    });
  });
});

describe('podeConfirmar', () => {
  it('só quem está no principal e ainda não confirmou', () => {
    const ms = Array.from({ length: 16 }, () => p('M'));
    ms[0] = { ...ms[0], status: 'confirmado' };
    const d = p('D');
    const e = calcularLista(entrada([...ms, d]));
    expect(podeConfirmar(e, ms[1].jogadorId)).toBe(true);
    expect(podeConfirmar(e, ms[0].jogadorId)).toBe(false);
    expect(podeConfirmar(e, d.jogadorId)).toBe(false);
    expect(podeConfirmar(e, 999999)).toBe(false);
  });
});

describe('travaDoJogador', () => {
  const ANTES_JOGO = new Date('2026-11-04T20:29:00-03:00');
  const JOGO = new Date('2026-11-04T20:30:00-03:00');
  const trava = (estadoManual: EstadoManual, now: Date) =>
    travaDoJogador(calcularLista({ presencas: [], dataQuarta: QUARTA, estadoManual, now }), QUARTA, estadoManual, now);

  it('lista aberta até a hora do jogo: sem trava', () => {
    expect(trava(null, ANTES_JOGO)).toBeNull();
  });
  it('do começo do jogo em diante o jogador não mexe mais', () => {
    expect(trava(null, JOGO)).toBe('comecou');
  });
  it('aberta à mão vale mesmo depois do horário', () => {
    expect(trava('aberta', JOGO)).toBeNull();
  });
  it('fechada à mão e já na hora do jogo: vale "começou" (nada mais muda pelo site)', () => {
    expect(trava('fechada', JOGO)).toBe('comecou');
  });
  it('fechada, cancelada e antes de abrir', () => {
    expect(trava('fechada', ANTES_JOGO)).toBe('fechada');
    expect(trava('cancelada', ANTES_JOGO)).toBe('cancelada');
    expect(trava(null, new Date('2026-11-01T23:59:00-03:00'))).toBe('fechada');
  });
});

describe('situacaoDoJogador', () => {
  const item = (jogadorId: number, confirmado = false, tipo: 'M' | 'D' = 'M') => ({ jogadorId, nome: `J${jogadorId}`, tipo, confirmado });
  const estado = {
    aberta: true,
    cancelada: false,
    vagas: 16,
    principal: [item(1, true), item(2, false, 'D')],
    fila: [item(3, false, 'D'), item(4, false, 'D')],
    foraDoPrazo: [item(5)],
  };

  it('na lista principal: posição, confirmado e tipo', () => {
    expect(situacaoDoJogador(estado, 1)).toEqual({ onde: 'principal', posicao: 1, confirmado: true, tipo: 'M' });
    expect(situacaoDoJogador(estado, 2)).toEqual({ onde: 'principal', posicao: 2, confirmado: false, tipo: 'D' });
  });
  it('na fila: posição na fila', () => {
    expect(situacaoDoJogador(estado, 4)).toEqual({ onde: 'fila', posicao: 2 });
  });
  it('mensalista que perdeu o prazo, e quem não está', () => {
    expect(situacaoDoJogador(estado, 5)).toEqual({ onde: 'perdeu_prazo' });
    expect(situacaoDoJogador(estado, 6)).toEqual({ onde: 'fora' });
  });
});

describe('travaParaSair', () => {
  const JOGO = new Date('2026-11-04T20:30:00-03:00');
  const ANTES = new Date('2026-11-04T10:00:00-03:00');
  const trava = (estadoManual: EstadoManual, now: Date) =>
    travaParaSair(calcularLista({ presencas: [], dataQuarta: QUARTA, estadoManual, now }), QUARTA, estadoManual, now);

  it('fechada ou ainda não aberta: sair continua valendo', () => {
    expect(trava('fechada', ANTES)).toBeNull();
    expect(trava(null, new Date('2026-11-01T12:00:00-03:00'))).toBeNull();
  });
  it('cancelada ou jogo começado travam; aberta à mão não', () => {
    expect(trava('cancelada', ANTES)).toBe('cancelada');
    expect(trava(null, JOGO)).toBe('comecou');
    expect(trava('fechada', JOGO)).toBe('comecou');
    expect(trava('aberta', JOGO)).toBeNull();
  });
});
