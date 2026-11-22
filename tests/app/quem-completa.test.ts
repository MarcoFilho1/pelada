import { describe, expect, it } from 'vitest';
import {
  completamDe,
  completamValido,
  escolhidosFora,
  proximaVaga,
  vagasDaPartida,
  type Resposta,
} from '@/app/admin/(area)/partidas/quem-completa';

const pepe = { id: 11, nome: 'Pepe', nota: 3 };
const juca = { id: 12, nome: 'Juca', nota: 2.5 };

describe('vagasDaPartida', () => {
  it('uma vaga por COMPLETE, primeiro as do lado A, na ordem dos COMPLETE', () => {
    expect(vagasDaPartida({ completes: [{ nota: 3 }] }, { completes: [{ nota: 2.5 }, { nota: 3.5 }] })).toEqual([
      { lado: 'A', nota: 3 },
      { lado: 'B', nota: 2.5 },
      { lado: 'B', nota: 3.5 },
    ]);
  });

  it('sem COMPLETE nos dois times, nenhuma vaga', () => {
    expect(vagasDaPartida({ completes: [] }, { completes: [] })).toEqual([]);
  });
});

describe('proximaVaga', () => {
  it('a primeira sem resposta depois da atual; depois volta ao começo; tudo respondido = null', () => {
    const r: (Resposta | undefined)[] = [undefined, { tipo: 'sem' }, undefined];
    expect(proximaVaga(r, -1)).toBe(0);
    expect(proximaVaga(r, 0)).toBe(2);
    expect(proximaVaga(r, 2)).toBe(0);
    expect(proximaVaga([{ tipo: 'sem' }, { tipo: 'jogador', jogador: pepe }], 0)).toBeNull();
  });
});

describe('completamDe', () => {
  it('junta os jogadores escolhidos por lado; "Jogar sem" não entra', () => {
    const vagas = vagasDaPartida({ completes: [{ nota: 3 }, { nota: 3 }] }, { completes: [{ nota: 3 }] });
    expect(completamDe(vagas, [{ tipo: 'jogador', jogador: pepe }, { tipo: 'sem' }, { tipo: 'jogador', jogador: juca }])).toEqual({
      A: [11],
      B: [12],
    });
  });
});

describe('escolhidosFora', () => {
  it('quem já completa outra vaga (a vaga atual não conta)', () => {
    const r: Resposta[] = [{ tipo: 'jogador', jogador: pepe }, { tipo: 'sem' }, { tipo: 'jogador', jogador: juca }];
    expect([...escolhidosFora(r, 0)]).toEqual([12]);
    expect([...escolhidosFora(r, 1)].sort()).toEqual([11, 12]);
  });
});

describe('completamValido', () => {
  it('aceita listas de ids por lado (até 4 cada)', () => {
    expect(completamValido({ A: [], B: [] })).toBe(true);
    expect(completamValido({ A: [1, 2], B: [3] })).toBe(true);
  });

  it('recusa formato errado', () => {
    for (const v of [null, undefined, [], {}, { A: [] }, { A: [1], B: 'x' }, { A: [0], B: [] }, { A: [1.5], B: [] }, { A: [1, 2, 3, 4, 5], B: [] }]) {
      expect(completamValido(v), JSON.stringify(v)).toBe(false);
    }
  });
});
