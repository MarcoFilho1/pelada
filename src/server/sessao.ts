import { cookies } from 'next/headers';
import type { DB } from '@/db/client';
import { dadosSessaoJogador, validarSessaoAdmin, validarSessaoJogador } from './auth';
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

/**
 * Grava a sessão do jogador (365 dias) com a versão de sessão e o `precisaTrocar` atuais
 * do banco. Chamar só em Server Function ou Route Handler.
 */
export async function criarSessaoJogador(db: DB, jogadorId: number): Promise<void> {
  const dados = await dadosSessaoJogador(db, jogadorId);
  if (!dados) throw new Error(`Jogador ${jogadorId} inativo ou inexistente`);
  await gravar(
    COOKIE_JOGADOR,
    { tipo: 'jogador', jogadorId, precisaTrocar: dados.precisaTrocar, versao: dados.versao },
    VALIDADE_JOGADOR,
  );
}

/** Grava a sessão admin (30 dias), separada da do jogador. */
export async function criarSessaoAdmin(adminId: number): Promise<void> {
  await gravar(COOKIE_ADMIN, { tipo: 'admin', adminId }, VALIDADE_ADMIN);
}

/**
 * Sessão do jogador conferida no banco: `null` (deslogado) se o cookie falta ou é inválido,
 * se o jogador foi desativado ou se as sessões dele foram revogadas.
 */
export async function lerSessaoJogador(db: DB): Promise<{ jogadorId: number; precisaTrocar: boolean } | null> {
  const t = await verificarToken((await cookies()).get(COOKIE_JOGADOR)?.value);
  return t?.tipo === 'jogador' ? validarSessaoJogador(db, t) : null;
}

/** Sessão admin conferida no banco: `null` se o cookie falta, é inválido ou o admin não existe. */
export async function lerSessaoAdmin(db: DB): Promise<{ adminId: number } | null> {
  const t = await verificarToken((await cookies()).get(COOKIE_ADMIN)?.value);
  return t?.tipo === 'admin' ? validarSessaoAdmin(db, t) : null;
}

export async function sair(tipo: 'jogador' | 'admin'): Promise<void> {
  (await cookies()).delete(tipo === 'jogador' ? COOKIE_JOGADOR : COOKIE_ADMIN);
}
