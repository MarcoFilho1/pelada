import { describe, expect, it } from 'vitest';
import { normalizarNome } from '@/domain/nome';

describe('normalizarNome', () => {
  it('tira acento, caixa e espaços sobrando', () => {
    expect(normalizarNome('  JOÃO   da Silva ')).toBe('joao da silva');
    expect(normalizarNome('Joao')).toBe(normalizarNome('João'));
  });
});
