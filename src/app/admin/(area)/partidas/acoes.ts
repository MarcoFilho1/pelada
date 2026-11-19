'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import type { JogadorNota } from '@/domain/sorteio';
import { idValido, mensagemParaUsuario } from '@/server/erros';
import { iniciarPartida, jogarMoeda, quemPodeCompletar } from '@/server/partidas';
import { peladaDaPartida } from '@/server/anotador';
import { acessoNaPelada, destinoSemAcesso, lerAcessoPartidas } from '@/server/sessao';
import { goleirosValidos, type Goleiros } from './goleiros';
import { completamValido, type Completam } from './quem-completa';

const PEDIDO_INVALIDO = { ok: false, erro: 'Pedido inválido.' } as const;

/** Admin, ou o anotador do link se a pelada é a dele. */
async function exigirAcesso(peladaId: number) {
  const acesso = await lerAcessoPartidas(getDb());
  if (!acessoNaPelada(acesso, peladaId)) redirect(destinoSemAcesso(acesso));
}

/**
 * Começa a partida entre os dois times escolhidos e abre o anotador. `completam` = quem completa os
 * COMPLETE de cada lado só nesta partida (menos ids que COMPLETE = o time joga sem). `goleiros` =
 * quem agarra em cada lado (opcional).
 */
export async function iniciar(
  peladaId: number,
  timeAId: number,
  timeBId: number,
  completam: Completam = { A: [], B: [] },
  goleiros: Goleiros = { A: null, B: null },
): Promise<{ ok: false; erro: string }> {
  await exigirAcesso(peladaId);
  if (!idValido(peladaId) || !idValido(timeAId) || !idValido(timeBId) || !completamValido(completam) || !goleirosValidos(goleiros)) {
    return PEDIDO_INVALIDO;
  }
  let id: number;
  try {
    id = await iniciarPartida(getDb(), peladaId, timeAId, timeBId, new Date(), { A: completam.A, B: completam.B }, { A: goleiros.A, B: goleiros.B });
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
  await exigirAcesso(peladaId);
  if (!idValido(peladaId) || !idValido(timeAId) || !idValido(timeBId)) return PEDIDO_INVALIDO;
  try {
    return { ok: true, ...(await quemPodeCompletar(getDb(), peladaId, timeAId, timeBId)) };
  } catch (e) {
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
}

/** Joga a moeda do empate da partida e devolve o lado que ganhou ('A' = cara, 'B' = coroa). */
export async function moeda(partidaId: number): Promise<{ ok: true; lado: 'A' | 'B' } | { ok: false; erro: string }> {
  if (!idValido(partidaId)) return PEDIDO_INVALIDO;
  const db = getDb();
  const peladaId = await peladaDaPartida(db, partidaId);
  if (peladaId === null) return { ok: false, erro: 'Essa partida não existe mais. Recarregue a página.' };
  await exigirAcesso(peladaId);
  try {
    return { ok: true, lado: await jogarMoeda(db, partidaId) };
  } catch (e) {
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
}
