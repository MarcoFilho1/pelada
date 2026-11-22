import { describe, expect, it } from 'vitest';
import { conferirSegredo, hashSegredo } from '@/server/senha';

describe('senha', () => {
  it('gera salt:hash em hex, com salt aleatório, e confere', async () => {
    const a = await hashSegredo('7788');
    const b = await hashSegredo('7788');
    expect(a).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(a).not.toBe(b);
    expect(await conferirSegredo('7788', a)).toBe(true);
    expect(await conferirSegredo('7789', a)).toBe(false);
  });

  it('recusa hash malformado sem lançar', async () => {
    expect(await conferirSegredo('7788', 'lixo')).toBe(false);
    expect(await conferirSegredo('7788', 'abcd:12')).toBe(false);
  });
});
