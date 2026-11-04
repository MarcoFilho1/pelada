import { and, eq, ilike, sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { admins, jogadores } from '@/db/schema';
import { estaBloqueado, PIN_PADRAO, pinNovoValido, pinValido, registrarErro } from '@/domain/pin';
import { conferirSegredo, hashSegredo } from './senha';

const MAX_SUGESTOES = 8;

// Hash bem formado que nunca confere: usado quando o usuário admin não existe,
// para a resposta levar o mesmo tempo e não revelar quais usuários existem.
const HASH_FALSO = `${'00'.repeat(16)}:${'00'.repeat(32)}`;

/** Escapa os curingas do LIKE para o termo valer como texto. */
function escaparLike(termo: string): string {
  return termo.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Jogadores ativos cujo nome contém o termo (quem começa com ele vem primeiro). */
export async function buscarJogadoresPorNome(db: DB, termo: string): Promise<{ id: number; nome: string }[]> {
  const t = escaparLike(termo.trim());
  if (!t) return [];
  return db
    .select({ id: jogadores.id, nome: jogadores.nome })
    .from(jogadores)
    .where(and(eq(jogadores.ativo, true), ilike(jogadores.nome, `%${t}%`)))
    .orderBy(sql`${jogadores.nome} ilike ${`${t}%`} desc`, sql`lower(${jogadores.nome})`)
    .limit(MAX_SUGESTOES);
}

export type ResultadoEntrada =
  | { ok: true; precisaTrocar: boolean }
  | { ok: false; motivo: 'pin_errado' | 'bloqueado' };

/**
 * Confere o PIN do jogador. Bloqueado: responde `bloqueado` sem olhar o PIN.
 * Até o bloqueio começar, erro é sempre `pin_errado` (não avisa quantas tentativas restam).
 * `pin_hash` nulo vale como PIN padrão (jogador novo ou PIN zerado).
 */
export async function entrarJogador(db: DB, jogadorId: number, pin: string, now: Date): Promise<ResultadoEntrada> {
  return db.transaction(async (tx) => {
    // FOR UPDATE: tentativas simultâneas no mesmo perfil contam uma de cada vez.
    const [j] = await tx.select().from(jogadores).where(eq(jogadores.id, jogadorId)).for('update');
    if (!j || !j.ativo) return { ok: false, motivo: 'pin_errado' };
    if (estaBloqueado(j.bloqueadoAte, now)) return { ok: false, motivo: 'bloqueado' };

    const certo =
      pinValido(pin) && (j.pinHash === null ? pin === PIN_PADRAO : await conferirSegredo(pin, j.pinHash));

    if (certo) {
      if (j.pinErros !== 0 || j.bloqueadoAte !== null) {
        await tx.update(jogadores).set({ pinErros: 0, bloqueadoAte: null }).where(eq(jogadores.id, j.id));
      }
      return { ok: true, precisaTrocar: j.pinPrecisaTrocar || j.pinHash === null };
    }

    const erro = registrarErro(j.pinErros, now);
    await tx
      .update(jogadores)
      .set({ pinErros: erro.erros, bloqueadoAte: erro.bloqueadoAte })
      .where(eq(jogadores.id, j.id));
    return { ok: false, motivo: erro.bloqueadoAte ? 'bloqueado' : 'pin_errado' };
  });
}

/** Grava o PIN novo (4 dígitos, diferente de 1234) e tira a obrigação de trocar. */
export async function trocarPin(db: DB, jogadorId: number, novoPin: string): Promise<void> {
  if (!pinNovoValido(novoPin)) {
    throw new Error(`PIN novo inválido: precisa ter 4 números e não pode ser ${PIN_PADRAO}`);
  }
  const atualizados = await db
    .update(jogadores)
    .set({ pinHash: await hashSegredo(novoPin), pinPrecisaTrocar: false, pinErros: 0, bloqueadoAte: null })
    .where(eq(jogadores.id, jogadorId))
    .returning({ id: jogadores.id });
  if (atualizados.length === 0) throw new Error(`Jogador ${jogadorId} não encontrado`);
}

export async function entrarAdmin(db: DB, usuario: string, senha: string): Promise<{ ok: boolean; adminId?: number }> {
  const [adm] = await db.select().from(admins).where(eq(admins.usuario, usuario.trim()));
  const certo = await conferirSegredo(senha, adm?.senhaHash ?? HASH_FALSO);
  return adm && certo ? { ok: true, adminId: adm.id } : { ok: false };
}
