'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import type { JogadorNota } from '@/domain/sorteio';
import { idValido, mensagemParaUsuario } from '@/server/erros';
import { iniciarPartida, quemPodeCompletar } from '@/server/partidas';
import { lerSessaoAdmin } from '@/server/sessao';
import { completamValido, type Completam } from './quem-completa';

const PEDIDO_INVALIDO = { ok: false, erro: 'Pedido inválido.' } as const;

/**
 * Começa a partida entre os dois times escolhidos e abre o anotador. `completam` = quem completa os
 * COMPLETE de cada lado só nesta partida (menos ids que COMPLETE = o time joga sem).
 */
export async function iniciar(
  peladaId: number,
  timeAId: number,
  timeBId: number,
  completam: Completam = { A: [], B: [] },
): Promise<{ ok: false; erro: string }> {
  if (!(await lerSessaoAdmin(getDb()))) redirect('/admin/entrar');
  if (!idValido(peladaId) || !idValido(timeAId) || !idValido(timeBId) || !completamValido(completam)) return PEDIDO_INVALIDO;
  let id: number;
  try {
    id = await iniciarPartida(getDb(), peladaId, timeAId, timeBId, new Date(), { A: completam.A, B: completam.B });
  } catch (e) {
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
  redirect(`/admin/partida/${id}`);
}

/**
 * Quem pode completar uma partida entre A e B: `deFora` (dos outros times da noite) e `semTime`
 * (ativos sem time atual), cada um por nome.
 */
export async function quemCompleta(
  peladaId: number,
  timeAId: number,
  timeBId: number,
): Promise<{ ok: true; deFora: JogadorNota[]; semTime: JogadorNota[] } | { ok: false; erro: string }> {
  if (!(await lerSessaoAdmin(getDb()))) redirect('/admin/entrar');
  if (!idValido(peladaId) || !idValido(timeAId) || !idValido(timeBId)) return PEDIDO_INVALIDO;
  try {
    return { ok: true, ...(await quemPodeCompletar(getDb(), peladaId, timeAId, timeBId)) };
  } catch (e) {
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
}
