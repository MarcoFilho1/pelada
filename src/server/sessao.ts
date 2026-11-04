import { cookies } from 'next/headers';
import { assinarToken, COOKIE_ADMIN, COOKIE_JOGADOR, verificarToken, type Token } from './token';

const DIA = 24 * 60 * 60;
const VALIDADE_JOGADOR = 365 * DIA;
const VALIDADE_ADMIN = 30 * DIA;

async function gravar(nome: string, payload: Token, validadeSeg: number) {
  const token = await assinarToken(payload, validadeSeg);
  (await cookies()).set(nome, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: validadeSeg,
  });
}

/** Grava a sessão do jogador (365 dias). Chamar só em Server Function ou Route Handler. */
export async function criarSessaoJogador(jogadorId: number, precisaTrocar = false): Promise<void> {
  await gravar(COOKIE_JOGADOR, { tipo: 'jogador', jogadorId, precisaTrocar }, VALIDADE_JOGADOR);
}

/** Grava a sessão admin (30 dias), separada da do jogador. */
export async function criarSessaoAdmin(adminId: number): Promise<void> {
  await gravar(COOKIE_ADMIN, { tipo: 'admin', adminId }, VALIDADE_ADMIN);
}

export async function lerSessaoJogador(): Promise<{ jogadorId: number; precisaTrocar: boolean } | null> {
  const t = await verificarToken((await cookies()).get(COOKIE_JOGADOR)?.value);
  return t?.tipo === 'jogador' ? { jogadorId: t.jogadorId, precisaTrocar: t.precisaTrocar } : null;
}

export async function lerSessaoAdmin(): Promise<{ adminId: number } | null> {
  const t = await verificarToken((await cookies()).get(COOKIE_ADMIN)?.value);
  return t?.tipo === 'admin' ? { adminId: t.adminId } : null;
}

export async function sair(tipo: 'jogador' | 'admin'): Promise<void> {
  (await cookies()).delete(tipo === 'jogador' ? COOKIE_JOGADOR : COOKIE_ADMIN);
}
