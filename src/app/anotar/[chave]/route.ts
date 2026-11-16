import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { COOKIE_ANOTADOR, validarChaveAnotador } from '@/server/anotador';
import { LINK_VENCIDO } from '@/server/sessao';

// O link que o robô manda: confere a chave, guarda no cookie (até o vencimento dela) e abre as partidas.
export async function GET(req: NextRequest, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params;
  const link = await validarChaveAnotador(getDb(), chave, new Date());
  if (!link) return NextResponse.redirect(new URL(LINK_VENCIDO, req.url));
  const res = NextResponse.redirect(new URL('/admin/partidas', req.url));
  res.cookies.set(COOKIE_ANOTADOR, chave, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: link.expiraEm,
  });
  // A chave fica fora de cache e de referer.
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}
