import { describe, expect, it } from 'vitest';
import { avisoDeEntrada } from '@/domain/mensagens';

describe('avisoDeEntrada', () => {
  it('só os dois valores da lista viram texto', () => {
    expect(avisoDeEntrada('pin_trocado')).toBe('PIN trocado. Entre com o PIN novo.');
    expect(avisoDeEntrada('senha_trocada')).toBe('Senha trocada. Entre com a senha nova.');
  });
  it('qualquer outra coisa na URL some', () => {
    for (const v of ['<b>oi</b>', 'toString', '__proto__', '', undefined, ['pin_trocado'], 3]) expect(avisoDeEntrada(v)).toBeNull();
  });
});
