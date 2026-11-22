import { afterEach, describe, expect, it, vi } from 'vitest';
import { MSG_ALGO_DEU_ERRADO } from '@/domain/mensagens';
import { ErroDeValidacao, idValido, mensagemParaUsuario } from '@/server/erros';

afterEach(() => vi.restoreAllMocks());

describe('idValido', () => {
  it('aceita inteiros de 1 a 2^31-1', () => {
    expect(idValido(1)).toBe(true);
    expect(idValido(2_147_483_647)).toBe(true);
  });
  it('recusa o que estouraria o Postgres ou não é id', () => {
    for (const v of [0, -1, 2_147_483_648, 1.5, Number.NaN, Infinity, '1', null, undefined]) {
      expect(idValido(v)).toBe(false);
    }
  });
});

describe('mensagemParaUsuario', () => {
  it('erro de validação: mostra a mensagem dele', () => {
    expect(mensagemParaUsuario(new ErroDeValidacao('Nota inválida.'))).toBe('Nota inválida.');
  });
  it('erro inesperado: mensagem genérica, detalhe só no log', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const e = new Error('duplicate key value violates unique constraint "x"');
    expect(mensagemParaUsuario(e)).toBe(MSG_ALGO_DEU_ERRADO);
    expect(log).toHaveBeenCalledWith(e);
  });
});
