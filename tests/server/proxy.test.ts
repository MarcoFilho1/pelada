import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config, proxy } from '@/proxy';
import { assinarToken, COOKIE_ADMIN, COOKIE_JOGADOR, type Token } from '@/server/token';

beforeEach(() => vi.stubEnv('SESSION_SECRET', 'segredo-de-teste-com-mais-de-32-caracteres'));
afterEach(() => vi.unstubAllEnvs());

async function pedir(caminho: string, cookies: Record<string, Token | string> = {}) {
  const req = new NextRequest(new URL(caminho, 'http://localhost'));
  for (const [nome, valor] of Object.entries(cookies)) {
    req.cookies.set(nome, typeof valor === 'string' ? valor : await assinarToken(valor, 60));
  }
  const res = await proxy(req);
  const destino = res.headers.get('location');
  return destino ? new URL(destino).pathname : 'segue';
}

const jogador = (precisaTrocar = false): Token => ({ tipo: 'jogador', jogadorId: 1, precisaTrocar, versao: 0 });
const admin: Token = { tipo: 'admin', adminId: 1, versao: 0 };

describe('proxy', () => {
  it('deixa abertas só as telas de entrar', async () => {
    expect(await pedir('/entrar')).toBe('segue');
    expect(await pedir('/admin/entrar')).toBe('segue');
  });

  it('sem sessão de jogador, manda para /entrar', async () => {
    expect(await pedir('/')).toBe('/entrar');
    expect(await pedir('/lista')).toBe('/entrar');
    expect(await pedir('/trocar-pin')).toBe('/entrar');
    expect(await pedir('/lista', { [COOKIE_JOGADOR]: 'token-falso' })).toBe('/entrar');
    expect(await pedir('/lista', { [COOKIE_ADMIN]: admin })).toBe('/entrar');
  });

  it('jogador que precisa trocar o PIN vai para /trocar-pin', async () => {
    expect(await pedir('/lista', { [COOKIE_JOGADOR]: jogador(true) })).toBe('/trocar-pin');
    expect(await pedir('/trocar-pin', { [COOKIE_JOGADOR]: jogador(true) })).toBe('segue');
    expect(await pedir('/lista', { [COOKIE_JOGADOR]: jogador(false) })).toBe('segue');
  });

  it('área admin exige a sessão admin, não a do jogador', async () => {
    expect(await pedir('/admin')).toBe('/admin/entrar');
    expect(await pedir('/admin/jogadores', { [COOKIE_JOGADOR]: jogador() })).toBe('/admin/entrar');
    expect(await pedir('/admin/jogadores', { [COOKIE_ADMIN]: jogador() })).toBe('/admin/entrar');
    expect(await pedir('/admin/jogadores', { [COOKIE_ADMIN]: admin })).toBe('segue');
  });

  it('as duas sessões convivem no mesmo aparelho', async () => {
    const ambos = { [COOKIE_JOGADOR]: jogador(), [COOKIE_ADMIN]: admin };
    expect(await pedir('/lista', ambos)).toBe('segue');
    expect(await pedir('/admin', ambos)).toBe('segue');
  });
});

describe('matcher do proxy', () => {
  const roda = (url: string) => unstable_doesMiddlewareMatch({ config, url });

  it('roda em toda rota, inclusive com ponto no último segmento', () => {
    expect(roda('/')).toBe(true);
    expect(roda('/lista')).toBe(true);
    expect(roda('/admin/x/1.0')).toBe(true);
    expect(roda('/admin/jogadores/caio.silva')).toBe(true);
  });

  it('pula só os arquivos estáticos conhecidos', () => {
    expect(roda('/_next/static/chunks/app.js')).toBe(false);
    expect(roda('/_next/image?url=x')).toBe(false);
    expect(roda('/favicon.ico')).toBe(false);
    expect(roda('/icon.svg')).toBe(false);
    expect(roda('/fontes/barlow.woff2')).toBe(false);
  });

  it('rota com ponto sem sessão é barrada', async () => {
    expect(await pedir('/admin/x/1.0')).toBe('/admin/entrar');
    expect(await pedir('/lista/a.b')).toBe('/entrar');
  });
});
