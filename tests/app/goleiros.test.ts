import { describe, expect, it } from 'vitest';
import { goleirosValidos, sugerirGoleiros } from '@/app/admin/(area)/partidas/goleiros';

const AZUL = 1;
const LARANJA = 2;
const VERDE = 3;
const todos = () => true;

describe('sugerirGoleiros', () => {
  it('sem partida anterior: sem goleiro', () => {
    expect(sugerirGoleiros(AZUL, LARANJA, [], todos)).toEqual({ A: null, B: null });
  });

  it('quem agarrou continua no mesmo time, mesmo se o time trocou de lado', () => {
    const anteriores = [
      { jogadorId: 10, timeId: VERDE },
      { jogadorId: 20, timeId: AZUL },
    ];
    expect(sugerirGoleiros(LARANJA, AZUL, anteriores, todos)).toEqual({ A: 10, B: 20 });
  });

  it('o goleiro de quem saiu vai para o lado vazio', () => {
    expect(sugerirGoleiros(AZUL, LARANJA, [{ jogadorId: 10, timeId: VERDE }], todos)).toEqual({ A: 10, B: null });
  });

  it('quem agora está jogando não é sugerido', () => {
    const anteriores = [
      { jogadorId: 10, timeId: AZUL },
      { jogadorId: 20, timeId: VERDE },
    ];
    expect(sugerirGoleiros(AZUL, LARANJA, anteriores, (id) => id !== 10)).toEqual({ A: 20, B: null });
  });
});

describe('goleirosValidos', () => {
  it('aceita ids positivos ou null, sem repetir', () => {
    expect(goleirosValidos({ A: null, B: null })).toBe(true);
    expect(goleirosValidos({ A: 3, B: 4 })).toBe(true);
    expect(goleirosValidos({ A: 3, B: 3 })).toBe(false);
    expect(goleirosValidos({ A: 0, B: null })).toBe(false);
    expect(goleirosValidos({ A: '3', B: null })).toBe(false);
    expect(goleirosValidos(null)).toBe(false);
  });
});
