// Link temporário de anotar: o robô gera, quem abre entra só nas telas de partida daquela pelada.
// A chave (32 bytes aleatórios) só existe no link e no cookie; o banco guarda o hash dela.
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { linksAnotador, partidas, peladas } from '@/db/schema';
import { proximaQuarta } from '@/domain/tempo';

export { COOKIE_ANOTADOR } from './token';

/** Hash guardado no banco (a semente do e2e também usa). */
export const hashDaChave = (chave: string) => createHash('sha256').update(chave).digest('hex');

/** Formato de uma chave gerada aqui: evita ir ao banco com lixo. */
const chaveComFormato = (chave: string) => /^[A-Za-z0-9_-]{43}$/.test(chave);

/** 3h da manhã seguinte ao dia da pelada, horário de Recife (cobre partida que passa da meia-noite). */
export function vencimentoDoLink(dataPelada: string): Date {
  const d = new Date(`${dataPelada}T03:00:00-03:00`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export type LinkCriado = { ok: true; chave: string; expiraEm: Date } | { ok: false; motivo: 'sem_pelada_hoje' };

/**
 * Cria o link da pelada da semana (lista ainda não aberta: recusa) e revoga os anteriores dela.
 * `criadoPor`: o nome de quem pediu, para o registro (nunca o telefone).
 */
export async function criarLinkAnotador(db: DB, criadoPor: string, now: Date): Promise<LinkCriado> {
  // A pelada da semana (a próxima quarta, ou a de hoje na quarta): o link pode ser gerado antes, para testar.
  const [p] = await db.select({ id: peladas.id, data: peladas.data }).from(peladas).where(eq(peladas.data, proximaQuarta(now)));
  if (!p) return { ok: false, motivo: 'sem_pelada_hoje' };
  const chave = randomBytes(32).toString('base64url');
  const expiraEm = vencimentoDoLink(p.data);
  await db.transaction(async (tx) => {
    await tx
      .update(linksAnotador)
      .set({ revogadoEm: now })
      .where(and(eq(linksAnotador.peladaId, p.id), isNull(linksAnotador.revogadoEm)));
    await tx.insert(linksAnotador).values({ peladaId: p.id, chaveHash: hashDaChave(chave), criadoPor: criadoPor.slice(0, 60), criadoEm: now, expiraEm });
  });
  return { ok: true, chave, expiraEm };
}

/** A pelada da chave, se ela existe, não venceu e não foi revogada; senão `null`. */
export async function validarChaveAnotador(db: DB, chave: string | undefined, now: Date): Promise<{ peladaId: number; expiraEm: Date } | null> {
  if (!chave || !chaveComFormato(chave)) return null;
  const [l] = await db
    .select({ peladaId: linksAnotador.peladaId, expiraEm: linksAnotador.expiraEm })
    .from(linksAnotador)
    .where(and(eq(linksAnotador.chaveHash, hashDaChave(chave)), isNull(linksAnotador.revogadoEm), gt(linksAnotador.expiraEm, now)));
  return l ?? null;
}

/** A pelada de uma partida; `null` se ela não existe. */
export async function peladaDaPartida(db: DB, partidaId: number): Promise<number | null> {
  const [p] = await db.select({ peladaId: partidas.peladaId }).from(partidas).where(eq(partidas.id, partidaId));
  return p?.peladaId ?? null;
}
