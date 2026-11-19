import { describe, expect, it } from 'vitest';
import {
  DURACAO_MS,
  filaDepois,
  GOLS_PARA_VENCER,
  placar,
  proximaPartidaSugerida,
  resultadoDoPlacar,
  acrescimo,
  minutoDoLance,
  sugerirEncerrar,
  tempoDeJogoMs,
  relogio,
} from '@/domain/partida';

const INICIO = new Date('2026-11-11T20:30:00-03:00');
const depois = (ms: number) => new Date(INICIO.getTime() + ms);
const MIN = 60_000;

describe('constantes', () => {
  it('partida de 8 minutos ou 3 gols', () => {
    expect(DURACAO_MS).toBe(8 * 60_000);
    expect(GOLS_PARA_VENCER).toBe(3);
  });
});

describe('placar', () => {
  const lados = new Map<number, 'A' | 'B'>([
    [1, 'A'],
    [2, 'A'],
    [3, 'B'],
    [4, 'B'],
  ]);

  it('soma os gols dos jogadores de cada lado; assistência não conta', () => {
    const lances = [
      { jogadorId: 1, tipo: 'gol' as const },
      { jogadorId: 2, tipo: 'gol' as const },
      { jogadorId: 3, tipo: 'gol' as const },
      { jogadorId: 2, tipo: 'assistencia' as const },
      { jogadorId: 4, tipo: 'assistencia' as const },
    ];
    expect(placar(lances, lados)).toEqual({ A: 2, B: 1 });
  });

  it('sem lances: 0 × 0; lance de quem não está na partida é ignorado', () => {
    expect(placar([], lados)).toEqual({ A: 0, B: 0 });
    expect(placar([{ jogadorId: 99, tipo: 'gol' }], lados)).toEqual({ A: 0, B: 0 });
  });
});

describe('resultadoDoPlacar', () => {
  it('quem fez mais gols vence; igual é empate', () => {
    expect(resultadoDoPlacar({ A: 3, B: 1 })).toBe('A');
    expect(resultadoDoPlacar({ A: 0, B: 2 })).toBe('B');
    expect(resultadoDoPlacar({ A: 1, B: 1 })).toBe('empate');
    expect(resultadoDoPlacar({ A: 0, B: 0 })).toBe('empate');
  });
});

describe('sugerirEncerrar', () => {
  it('3 gols de um lado: tres_gols (mesmo antes do tempo)', () => {
    expect(sugerirEncerrar({ A: 3, B: 1 }, 2 * MIN)).toBe('tres_gols');
    expect(sugerirEncerrar({ A: 0, B: 3 }, 2 * MIN)).toBe('tres_gols');
  });

  it('8:00 de jogo: tempo', () => {
    expect(sugerirEncerrar({ A: 1, B: 1 }, 8 * MIN)).toBe('tempo');
    expect(sugerirEncerrar({ A: 0, B: 0 }, 12 * MIN)).toBe('tempo');
  });

  it('3 gols e tempo esgotado: tres_gols tem prioridade', () => {
    expect(sugerirEncerrar({ A: 3, B: 2 }, 9 * MIN)).toBe('tres_gols');
  });

  it('antes de 8:00 e sem 3 gols: null', () => {
    expect(sugerirEncerrar({ A: 2, B: 2 }, 8 * MIN - 1)).toBeNull();
  });
});

describe('tempoDeJogoMs', () => {
  const rodando = { iniciadaEm: INICIO, pausadoMs: 0, pausadaEm: null };

  it('sobe a partir de 0:00 e passa dos 8:00', () => {
    expect(tempoDeJogoMs(rodando, INICIO)).toBe(0);
    expect(tempoDeJogoMs(rodando, depois(3 * MIN))).toBe(3 * MIN);
    expect(tempoDeJogoMs(rodando, depois(9 * MIN))).toBe(9 * MIN);
  });

  it('tira o tempo já pausado', () => {
    expect(tempoDeJogoMs({ ...rodando, pausadoMs: MIN }, depois(5 * MIN))).toBe(4 * MIN);
  });

  it('pausada agora: para na hora da pausa', () => {
    const pausada = { iniciadaEm: INICIO, pausadoMs: MIN, pausadaEm: depois(4 * MIN) };
    expect(tempoDeJogoMs(pausada, depois(4 * MIN))).toBe(3 * MIN);
    expect(tempoDeJogoMs(pausada, depois(20 * MIN))).toBe(3 * MIN);
  });

  it('relógio do servidor atrás do início: 0:00', () => {
    expect(tempoDeJogoMs(rodando, depois(-5_000))).toBe(0);
  });
});

describe('proximaPartidaSugerida', () => {
  it('sem partida anterior: os dois primeiros da fila', () => {
    expect(proximaPartidaSugerida([1, 2, 3, 4], null)).toEqual([1, 2]);
  });

  it('com vencedor: o vencedor contra o primeiro que não jogou a última', () => {
    expect(proximaPartidaSugerida([1, 2, 3, 4], { timeA: 1, timeB: 2, resultado: 'A' })).toEqual([1, 3]);
    expect(proximaPartidaSugerida([1, 2, 3, 4], { timeA: 1, timeB: 2, resultado: 'B' })).toEqual([2, 3]);
  });

  it('empate: os dois seguintes da fila', () => {
    expect(proximaPartidaSugerida([1, 2, 3, 4], { timeA: 1, timeB: 2, resultado: 'empate' })).toEqual([3, 4]);
  });

  it('a última partida pode ter sido uma escolha livre do admin, fora da ordem da fila', () => {
    expect(proximaPartidaSugerida([1, 2, 3, 4], { timeA: 3, timeB: 1, resultado: 'A' })).toEqual([3, 2]);
    expect(proximaPartidaSugerida([1, 2, 3, 4], { timeA: 2, timeB: 4, resultado: 'empate' })).toEqual([1, 3]);
  });

  it('3 times: empate faz o de fora jogar contra um dos que empataram', () => {
    expect(proximaPartidaSugerida([1, 2, 3], { timeA: 1, timeB: 2, resultado: 'empate' })).toEqual([3, 1]);
  });

  it('2 times: sempre os dois', () => {
    expect(proximaPartidaSugerida([1, 2], { timeA: 1, timeB: 2, resultado: 'B' })).toEqual([2, 1]);
    expect(proximaPartidaSugerida([1, 2], { timeA: 1, timeB: 2, resultado: 'empate' })).toEqual([1, 2]);
  });

  it('menos de 2 times: erro (não há partida possível)', () => {
    expect(() => proximaPartidaSugerida([1], null)).toThrow();
  });
});

describe('filaDepois', () => {
  it('vencedor vai para a frente, perdedor para o fim', () => {
    expect(filaDepois([1, 2, 3, 4], { timeA: 1, timeB: 2, resultado: 'A' })).toEqual([1, 3, 4, 2]);
  });

  it('empate: os dois vão para o fim, na ordem A, B', () => {
    expect(filaDepois([1, 2, 3, 4], { timeA: 1, timeB: 2, resultado: 'empate' })).toEqual([3, 4, 1, 2]);
  });

  it('uma noite inteira: quem perde sai, quem vence fica', () => {
    let fila = [1, 2, 3, 4];
    fila = filaDepois(fila, { timeA: 1, timeB: 2, resultado: 'B' }); // 2 fica
    expect(fila).toEqual([2, 3, 4, 1]);
    fila = filaDepois(fila, { timeA: 2, timeB: 3, resultado: 'empate' }); // saem os dois
    expect(fila).toEqual([4, 1, 2, 3]);
    fila = filaDepois(fila, { timeA: 4, timeB: 1, resultado: 'A' });
    expect(fila).toEqual([4, 2, 3, 1]);
  });
});

describe('relogio', () => {
  it('mostra m:ss cortando o segundo (0:00 no início, 8:00 só quando chega)', () => {
    expect(relogio(0)).toBe('0:00');
    expect(relogio(999)).toBe('0:00');
    expect(relogio(61_000)).toBe('1:01');
    expect(relogio(5 * 60_000 + 32_999)).toBe('5:32');
    expect(relogio(DURACAO_MS - 1)).toBe('7:59');
    expect(relogio(DURACAO_MS)).toBe('8:00');
  });
});

describe('acrescimo', () => {
  it('só depois de um segundo inteiro passado dos 8:00', () => {
    expect(acrescimo(DURACAO_MS - 1)).toBeNull();
    expect(acrescimo(DURACAO_MS + 999)).toBeNull();
    expect(acrescimo(DURACAO_MS + 12_000)).toBe('+0:12');
    expect(acrescimo(DURACAO_MS + 75_000)).toBe('+1:15');
  });
});

describe('minutoDoLance', () => {
  it('o minuto que o cronômetro mostrava', () => {
    expect(minutoDoLance(0)).toBe(0);
    expect(minutoDoLance(59_999)).toBe(0);
    expect(minutoDoLance(2 * MIN + 9_000)).toBe(2);
    expect(minutoDoLance(8 * MIN + 30_000)).toBe(8);
  });
});
