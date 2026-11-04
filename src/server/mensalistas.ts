import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { jogadores, mensalistasMes } from '@/db/schema';

export const MAX_MENSALISTAS = 16;

export function mesValido(mes: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

function exigirMes(mes: string) {
  if (!mesValido(mes)) throw new Error(`Mês inválido: ${mes}. Use AAAA-MM.`);
}

/**
 * Mensalistas ativos do mês. Mês sem nenhum registro copia o do mês anterior mais recente
 * que tenha (só jogadores ativos), grava e devolve. Transação + `onConflictDoNothing`:
 * duas chamadas juntas não duplicam nem falham.
 */
export async function mensalistasDoMes(db: DB, mes: string): Promise<number[]> {
  exigirMes(mes);
  return db.transaction(async (tx) => {
    const doMes = () =>
      tx
        .select({ id: mensalistasMes.jogadorId })
        .from(mensalistasMes)
        .innerJoin(jogadores, eq(jogadores.id, mensalistasMes.jogadorId))
        .where(and(eq(mensalistasMes.mes, mes), eq(jogadores.ativo, true)));

    const [existe] = await tx.select({ mes: mensalistasMes.mes }).from(mensalistasMes).where(eq(mensalistasMes.mes, mes)).limit(1);
    if (!existe) {
      const [anterior] = await tx
        .select({ mes: mensalistasMes.mes })
        .from(mensalistasMes)
        .where(lt(mensalistasMes.mes, mes))
        .orderBy(desc(mensalistasMes.mes))
        .limit(1);
      if (anterior) {
        await tx.execute(sql`
          insert into ${mensalistasMes} (mes, jogador_id)
          select ${mes}, m.jogador_id from ${mensalistasMes} m
          join ${jogadores} j on j.id = m.jogador_id
          where m.mes = ${anterior.mes} and j.ativo
          on conflict do nothing`);
      }
    }
    return (await doMes()).map((r) => r.id);
  });
}

/** Troca o conjunto de mensalistas do mês por inteiro. Máximo 16 (`max_16`); só jogadores ativos. */
export async function definirMensalistas(db: DB, mes: string, jogadorIds: number[]): Promise<void> {
  exigirMes(mes);
  const ids = [...new Set(jogadorIds)];
  if (ids.length > MAX_MENSALISTAS) throw new Error('max_16');
  await db.transaction(async (tx) => {
    if (ids.length > 0) {
      const ativos = await tx
        .select({ id: jogadores.id })
        .from(jogadores)
        .where(and(inArray(jogadores.id, ids), eq(jogadores.ativo, true)));
      if (ativos.length !== ids.length) throw new Error('Jogador desconhecido ou inativo na lista.');
    }
    await tx.delete(mensalistasMes).where(eq(mensalistasMes.mes, mes));
    if (ids.length > 0) await tx.insert(mensalistasMes).values(ids.map((jogadorId) => ({ mes, jogadorId })));
  });
}
