import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_ADMIN, COOKIE_JOGADOR, verificarToken } from '@/server/token';

// Checagem otimista: só confere a assinatura do cookie, sem tocar no banco.

const ENTRAR_JOGADOR = '/entrar';
const ENTRAR_ADMIN = '/admin/entrar';
const TROCAR_PIN = '/trocar-pin';

function redirecionar(req: NextRequest, destino: string) {
  return NextResponse.redirect(new URL(destino, req.url));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === ENTRAR_JOGADOR || pathname === ENTRAR_ADMIN) return NextResponse.next();

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const admin = await verificarToken(req.cookies.get(COOKIE_ADMIN)?.value);
    return admin?.tipo === 'admin' ? NextResponse.next() : redirecionar(req, ENTRAR_ADMIN);
  }

  const jogador = await verificarToken(req.cookies.get(COOKIE_JOGADOR)?.value);
  if (jogador?.tipo !== 'jogador') return redirecionar(req, ENTRAR_JOGADOR);
  if (jogador.precisaTrocar && pathname !== TROCAR_PIN) return redirecionar(req, TROCAR_PIN);
  return NextResponse.next();
}

export const config = {
  // Tudo, menos arquivos do Next e arquivos estáticos (com extensão).
  matcher: ['/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)'],
};
