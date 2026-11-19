import { describe, expect, it } from 'vitest';
import { linhaDoTempo, type LanceNoTempo } from '@/domain/linha-do-tempo';

const s = (m: number, seg: number) => (m * 60 + seg) * 1000;
const [MANOEL, PAULO, JOSENILDO, BARTOLOMEU, GIANLUCA] = [1, 2, 3, 4, 5];

describe('linhaDoTempo', () => {
  it('a partida real Verde 3×1 Azul: cada assistência fica com o gol dela', () => {
    let id = 0;
    const l = (jogadorId: number, tipo: 'gol' | 'assistencia', lado: 'A' | 'B', tempoMs: number): LanceNoTempo => ({ id: ++id, jogadorId, tipo, lado, tempoMs });
    const eventos = linhaDoTempo([
      l(MANOEL, 'assistencia', 'A', s(2, 8)),
      l(PAULO, 'gol', 'A', s(2, 9)),
      l(MANOEL, 'assistencia', 'A', s(5, 47)),
      l(JOSENILDO, 'gol', 'A', s(5, 49)),
      l(BARTOLOMEU, 'assistencia', 'B', s(6, 23)),
      l(GIANLUCA, 'gol', 'B', s(6, 24)),
      l(JOSENILDO, 'gol', 'A', s(7, 11)),
    ]);
    expect(eventos).toEqual([
      { tipo: 'gol', lado: 'A', tempoMs: s(2, 9), autor: PAULO, assistencia: MANOEL, placar: { A: 1, B: 0 } },
      { tipo: 'gol', lado: 'A', tempoMs: s(5, 49), autor: JOSENILDO, assistencia: MANOEL, placar: { A: 2, B: 0 } },
      { tipo: 'gol', lado: 'B', tempoMs: s(6, 24), autor: GIANLUCA, assistencia: BARTOLOMEU, placar: { A: 2, B: 1 } },
      { tipo: 'gol', lado: 'A', tempoMs: s(7, 11), autor: JOSENILDO, assistencia: null, placar: { A: 3, B: 1 } },
    ]);
  });

  it('assistência longe do gol, do outro lado ou do próprio autor fica sozinha', () => {
    const eventos = linhaDoTempo([
      { id: 1, jogadorId: MANOEL, tipo: 'assistencia', lado: 'A', tempoMs: s(1, 0) },
      { id: 2, jogadorId: BARTOLOMEU, tipo: 'assistencia', lado: 'B', tempoMs: s(3, 0) },
      { id: 3, jogadorId: PAULO, tipo: 'assistencia', lado: 'A', tempoMs: s(3, 5) },
      { id: 4, jogadorId: PAULO, tipo: 'gol', lado: 'A', tempoMs: s(3, 10) },
    ]);
    expect(eventos.map((e) => [e.tipo, e.autor])).toEqual([
      ['assistencia', MANOEL],
      ['assistencia', BARTOLOMEU],
      ['assistencia', PAULO],
      ['gol', PAULO],
    ]);
    expect(eventos[3]).toMatchObject({ assistencia: null });
  });

  it('lance sem hora (posto em Corrigir) vai para o fim e não pega assistência', () => {
    const eventos = linhaDoTempo([
      { id: 1, jogadorId: PAULO, tipo: 'gol', lado: 'A', tempoMs: null },
      { id: 2, jogadorId: MANOEL, tipo: 'assistencia', lado: 'A', tempoMs: s(1, 0) },
      { id: 3, jogadorId: GIANLUCA, tipo: 'gol', lado: 'B', tempoMs: s(2, 0) },
    ]);
    expect(eventos.map((e) => [e.tipo, e.autor, e.tempoMs])).toEqual([
      ['assistencia', MANOEL, s(1, 0)],
      ['gol', GIANLUCA, s(2, 0)],
      ['gol', PAULO, null],
    ]);
    expect(eventos[2]).toMatchObject({ placar: { A: 1, B: 1 } });
  });
});
