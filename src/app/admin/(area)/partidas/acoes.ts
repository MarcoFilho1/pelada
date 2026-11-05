'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { idValido, mensagemParaUsuario } from '@/server/erros';
import { iniciarPartida } from '@/server/partidas';
import { lerSessaoAdmin } from '@/server/sessao';

/** Começa a partida entre os dois times escolhidos e abre o anotador. */
export async function iniciar(peladaId: number, timeAId: number, timeBId: number): Promise<{ ok: false; erro: string }> {
  if (!(await lerSessaoAdmin(getDb()))) redirect('/admin/entrar');
  if (!idValido(peladaId) || !idValido(timeAId) || !idValido(timeBId)) return { ok: false, erro: 'Pedido inválido.' };
  let id: number;
  try {
    id = await iniciarPartida(getDb(), peladaId, timeAId, timeBId, new Date());
  } catch (e) {
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
  redirect(`/admin/partida/${id}`);
}
