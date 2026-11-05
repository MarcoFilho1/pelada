import { jwtVerify, SignJWT } from 'jose';

// Sem dependência de Next nem do banco: usado pelo proxy e testável direto.

export const COOKIE_JOGADOR = 'pelada_jogador';
export const COOKIE_ADMIN = 'pelada_admin';

/**
 * `precisaTrocar` aqui só serve ao redirecionamento otimista do proxy; quem decide é o banco.
 * `versao` precisa bater com `jogadores.sessao_versao` (ver `validarSessaoJogador`).
 */
export type TokenJogador = { tipo: 'jogador'; jogadorId: number; precisaTrocar: boolean; versao: number };
/** `versao` precisa bater com `admins.sessao_versao` (ver `validarSessaoAdmin`). */
export type TokenAdmin = { tipo: 'admin'; adminId: number; versao: number };
export type Token = TokenJogador | TokenAdmin;

const ALG = 'HS256';
const TAM_MINIMO_SEGREDO = 32;

function chave(): Uint8Array {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < TAM_MINIMO_SEGREDO) {
    throw new Error(`SESSION_SECRET precisa ter pelo menos ${TAM_MINIMO_SEGREDO} caracteres`);
  }
  return new TextEncoder().encode(segredo);
}

/** Assina o token de sessão, válido por `validadeSeg` segundos. */
export async function assinarToken(payload: Token, validadeSeg: number): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt(agora)
    .setExpirationTime(agora + validadeSeg)
    .sign(chave());
}

function ehIdValido(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

function ehVersaoValida(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** Lê o token; devolve `null` se faltar, estiver vencido, adulterado ou com formato errado. */
export async function verificarToken(token: string | undefined): Promise<Token | null> {
  if (!token) return null;
  const k = chave(); // segredo ausente é erro de configuração: deve estourar, não "deslogar"
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, k, { algorithms: [ALG] }));
  } catch {
    return null;
  }
  if (
    payload.tipo === 'jogador' &&
    ehIdValido(payload.jogadorId) &&
    typeof payload.precisaTrocar === 'boolean' &&
    ehVersaoValida(payload.versao)
  ) {
    return { tipo: 'jogador', jogadorId: payload.jogadorId, precisaTrocar: payload.precisaTrocar, versao: payload.versao };
  }
  if (payload.tipo === 'admin' && ehIdValido(payload.adminId) && ehVersaoValida(payload.versao)) {
    return { tipo: 'admin', adminId: payload.adminId, versao: payload.versao };
  }
  return null;
}
