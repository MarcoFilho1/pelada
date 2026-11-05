'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { MAX_MENSALISTAS } from '@/domain/tempo';
import { idValido, mensagemParaUsuario } from '@/server/erros';
import { definirMensalistas, mesValido } from '@/server/mensalistas';
import { lerSessaoAdmin } from '@/server/sessao';

export type Resposta = { ok: true } | { ok: false; erro: string };

export async function salvarMensalistas(mes: string, jogadorIds: number[]): Promise<Resposta> {
  const db = getDb();
  if (!(await lerSessaoAdmin(db))) redirect('/admin/entrar');
  if (typeof mes !== 'string' || !mesValido(mes) || !Array.isArray(jogadorIds) || !jogadorIds.every(idValido)) {
    return { ok: false, erro: 'Pedido inválido.' };
  }
  try {
    await definirMensalistas(db, mes, jogadorIds);
    revalidatePath('/admin/mensalistas');
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.message === 'min_1') return { ok: false, erro: 'Marque pelo menos 1 mensalista.' };
    if (e instanceof Error && e.message === 'max_16') {
      return { ok: false, erro: `No máximo ${MAX_MENSALISTAS} mensalistas por mês.` };
    }
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
}
