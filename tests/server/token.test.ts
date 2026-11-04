import { SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assinarToken, verificarToken } from '@/server/token';

const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres';

beforeEach(() => vi.stubEnv('SESSION_SECRET', SEGREDO));
afterEach(() => vi.unstubAllEnvs());

describe('token de sessão', () => {
  it('assina e lê o token do jogador e do admin', async () => {
    const tj = await assinarToken({ tipo: 'jogador', jogadorId: 7, precisaTrocar: true }, 60);
    expect(await verificarToken(tj)).toEqual({ tipo: 'jogador', jogadorId: 7, precisaTrocar: true });
    const ta = await assinarToken({ tipo: 'admin', adminId: 2 }, 60);
    expect(await verificarToken(ta)).toEqual({ tipo: 'admin', adminId: 2 });
  });

  it('recusa token adulterado, vazio ou de outro segredo', async () => {
    const t = await assinarToken({ tipo: 'admin', adminId: 2 }, 60);
    expect(await verificarToken(t.slice(0, -2) + 'xx')).toBeNull();
    expect(await verificarToken(undefined)).toBeNull();
    expect(await verificarToken('')).toBeNull();
    vi.stubEnv('SESSION_SECRET', 'outro-segredo-com-mais-de-32-caracteres!!');
    expect(await verificarToken(t)).toBeNull();
  });

  it('recusa token vencido', async () => {
    const t = await assinarToken({ tipo: 'admin', adminId: 2 }, -10);
    expect(await verificarToken(t)).toBeNull();
  });

  it('recusa payload com formato errado mesmo bem assinado', async () => {
    const t = await new SignJWT({ tipo: 'admin', adminId: '2' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1m')
      .sign(new TextEncoder().encode(SEGREDO));
    expect(await verificarToken(t)).toBeNull();
  });

  it('exige SESSION_SECRET com pelo menos 32 caracteres', async () => {
    vi.stubEnv('SESSION_SECRET', 'curto');
    await expect(assinarToken({ tipo: 'admin', adminId: 1 }, 60)).rejects.toThrow();
  });
});
