import { describe, expect, it } from 'vitest';
import { avisoDaBateria, degrauDe, lerBateria, quemAvisarDaBateria, VALIDADE_MS } from '@/robo/bateria';

const agora = 1_795_650_000_000;
const arquivo = (nivel: unknown, carregando: unknown = false, quando: unknown = agora) => JSON.stringify({ nivel, carregando, quando });

describe('lerBateria', () => {
  it('lê o arquivo do app', () => {
    expect(lerBateria(arquivo(17), agora)).toEqual({ nivel: 17, carregando: false });
  });
  it('recusa leitura velha, do futuro ou quebrada', () => {
    expect(lerBateria(arquivo(17, false, agora - VALIDADE_MS - 1), agora)).toBeNull();
    expect(lerBateria(arquivo(17, false, agora + VALIDADE_MS + 1), agora)).toBeNull();
    expect(lerBateria('{"nivel":', agora)).toBeNull();
    expect(lerBateria(arquivo(140), agora)).toBeNull();
    expect(lerBateria(arquivo('17'), agora)).toBeNull();
    expect(lerBateria(arquivo(17, 'não'), agora)).toBeNull();
    expect(lerBateria('null', agora)).toBeNull();
  });
});

describe('degrauDe', () => {
  it('acha o degrau mais baixo já alcançado', () => {
    expect(degrauDe(21)).toBeNull();
    expect(degrauDe(20)).toBe(20);
    expect(degrauDe(16)).toBe(20);
    expect(degrauDe(15)).toBe(15);
    expect(degrauDe(4)).toBe(5);
    expect(degrauDe(1)).toBe(1);
    expect(degrauDe(0)).toBe(1);
  });
});

describe('avisoDaBateria', () => {
  const descer = (niveis: number[]) => {
    let avisado: number | null = null;
    const avisos: number[] = [];
    for (const nivel of niveis) {
      const r = avisoDaBateria({ nivel, carregando: false }, avisado);
      avisado = r.avisado;
      if (r.texto) avisos.push(nivel);
    }
    return avisos;
  };

  it('avisa uma vez em cada degrau: 20, 15, 10, 5, 3, 2 e 1', () => {
    const niveis = Array.from({ length: 30 }, (_, i) => 30 - i); // 30 → 1
    expect(descer(niveis)).toEqual([20, 15, 10, 5, 3, 2, 1]);
  });
  it('não repete o aviso enquanto está no mesmo degrau', () => {
    expect(descer([19, 19, 18, 19, 17])).toEqual([19]);
  });
  it('se a bateria pula degraus, avisa só o de agora', () => {
    expect(descer([40, 9])).toEqual([9]);
  });
  it('no carregador não avisa, e a conta zera', () => {
    expect(avisoDaBateria({ nivel: 8, carregando: true }, 10)).toEqual({ avisado: null, texto: null });
    expect(avisoDaBateria({ nivel: 9, carregando: false }, null).texto).toContain('9%');
  });
  it('subir um pouco sem carregador não avisa de novo', () => {
    expect(avisoDaBateria({ nivel: 16, carregando: false }, 15)).toEqual({ avisado: 15, texto: null });
  });
  it('o texto diz o nível e o que fazer; abaixo de 5% pede agora', () => {
    expect(avisoDaBateria({ nivel: 20, carregando: false }, null).texto).toBe('🔋 Bateria do celular do robô em 20%. Ponha para carregar: se o aparelho desligar, o robô para.');
    expect(avisoDaBateria({ nivel: 3, carregando: false }, 5).texto).toContain('agora');
  });
});

describe('quemAvisarDaBateria', () => {
  it('lê os números extras', () => {
    expect(quemAvisarDaBateria({ ROBO_BATERIA_AVISAR: ' +55 (83) 90000-0001, 5583900000002 ,x' })).toEqual(['5583900000001', '5583900000002']);
    expect(quemAvisarDaBateria({})).toEqual([]);
  });
});
