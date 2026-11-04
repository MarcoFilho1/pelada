'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { definirMensalistas, MAX_MENSALISTAS, mesValido } from '@/server/mensalistas';
import { lerSessaoAdmin } from '@/server/sessao';

export type Resposta = { ok: true } | { ok: false; erro: string };

export async function salvarMensalistas(mes: string, jogadorIds: number[]): Promise<Resposta> {
  const db = getDb();
  if (!(await lerSessaoAdmin(db))) redirect('/admin/entrar');
  if (typeof mes !== 'string' || !mesValido(mes) || !Array.isArray(jogadorIds) || !jogadorIds.every(Number.isInteger)) {
    return { ok: false, erro: 'Pedido inválido.' };
  }
  try {
    await definirMensalistas(db, mes, jogadorIds);
    revalidatePath('/admin/mensalistas');
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.message === 'max_16') {
      return { ok: false, erro: `No máximo ${MAX_MENSALISTAS} mensalistas por mês.` };
    }
    return { ok: false, erro: e instanceof Error ? e.message : 'Não deu para salvar. Tente de novo.' };
  }
}
