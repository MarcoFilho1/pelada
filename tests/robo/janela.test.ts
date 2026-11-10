import { describe, expect, it } from 'vitest';
import { dentroDaJanela, esperaAte, proximaJanela } from '@/robo/janela';

const t = (s: string) => new Date(`${s}-03:00`);

describe('janela do robô (segunda 14:00 → quarta 20:30)', () => {
  it('dentro e fora', () => {
    expect(dentroDaJanela(t('2026-11-09T13:59:59'))).toBe(false);
    expect(dentroDaJanela(t('2026-11-09T14:00:00'))).toBe(true);
    expect(dentroDaJanela(t('2026-11-10T03:00:00'))).toBe(true);
    expect(dentroDaJanela(t('2026-11-11T20:29:59'))).toBe(true);
    expect(dentroDaJanela(t('2026-11-11T20:30:00'))).toBe(false);
    expect(dentroDaJanela(t('2026-11-12T10:00:00'))).toBe(false);
  });

  it('próxima janela: mesma semana antes de segunda 14:00; seguinte depois de quarta 20:30 (inclusive antes das 22:30)', () => {
    expect(proximaJanela(t('2026-11-09T08:00:00'))).toEqual(t('2026-11-09T14:00:00'));
    expect(proximaJanela(t('2026-11-11T21:00:00'))).toEqual(t('2026-11-16T14:00:00'));
    expect(proximaJanela(t('2026-11-11T23:00:00'))).toEqual(t('2026-11-16T14:00:00'));
    expect(proximaJanela(t('2026-11-14T12:00:00'))).toEqual(t('2026-11-16T14:00:00'));
  });

  it('espera: 60 s dentro; fora, até a janela com teto de 1 h', () => {
    expect(esperaAte(t('2026-11-10T10:00:00'))).toBe(60_000);
    expect(esperaAte(t('2026-11-09T13:45:00'))).toBe(15 * 60_000);
    expect(esperaAte(t('2026-11-12T10:00:00'))).toBe(60 * 60_000);
  });
});
