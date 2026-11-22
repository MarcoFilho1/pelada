import { describe, expect, it } from 'vitest';
import { estaBloqueado, pinNovoValido, pinValido, registrarErro } from '@/domain/pin';

const now = new Date('2026-11-04T12:00:00-03:00');

describe('pinValido', () => {
  it('aceita exatamente 4 dígitos', () => {
    expect(pinValido('0420')).toBe(true);
    expect(pinValido('1234')).toBe(true);
    expect(pinValido('12a4')).toBe(false);
    expect(pinValido('12345')).toBe(false);
    expect(pinValido('123')).toBe(false);
    expect(pinValido('')).toBe(false);
    expect(pinValido(' 123')).toBe(false);
    expect(pinValido('١٢٣٤')).toBe(false); // dígitos não ASCII
  });
});

describe('pinNovoValido', () => {
  it('recusa o PIN padrão e PIN inválido', () => {
    expect(pinNovoValido('7788')).toBe(true);
    expect(pinNovoValido('1234')).toBe(false);
    expect(pinNovoValido('77a8')).toBe(false);
  });
});

describe('registrarErro', () => {
  it('conta o erro sem bloquear antes do 5º', () => {
    expect(registrarErro(0, now)).toEqual({ erros: 1, bloqueadoAte: null });
    expect(registrarErro(3, now)).toEqual({ erros: 4, bloqueadoAte: null });
  });

  it('no 5º erro bloqueia por 15 minutos e zera a contagem', () => {
    expect(registrarErro(4, now)).toEqual({
      erros: 0,
      bloqueadoAte: new Date('2026-11-04T12:15:00-03:00'),
    });
  });
});

describe('estaBloqueado', () => {
  it('fica bloqueado até o horário e libera depois', () => {
    const ate = new Date('2026-11-04T12:15:00-03:00');
    expect(estaBloqueado(ate, now)).toBe(true);
    expect(estaBloqueado(ate, new Date('2026-11-04T12:14:59-03:00'))).toBe(true);
    expect(estaBloqueado(ate, ate)).toBe(false);
    expect(estaBloqueado(null, now)).toBe(false);
  });
});
