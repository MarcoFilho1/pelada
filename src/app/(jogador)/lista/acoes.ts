'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { mensagemParaUsuario } from '@/server/erros';
import { confirmar, entrarNaFila, remover } from '@/server/presencas';
import { lerSessaoJogador } from '@/server/sessao';

export type Resposta = { ok: true } | { ok: false; erro: string };

/** O jogador só mexe na própria presença: o id vem da sessão, nunca do cliente. */
async function comOJogador(fn: (jogadorId: number) => Promise<void>): Promise<Resposta> {
  const db = getDb();
  const sessao = await lerSessaoJogador(db);
  if (!sessao) redirect('/entrar');
  if (sessao.precisaTrocar) redirect('/trocar-pin');
  try {
    await fn(sessao.jogadorId);
  } catch (e) {
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
  revalidatePath('/lista');
  return { ok: true };
}

export async function vou(): Promise<Resposta> {
  return comOJogador((id) => confirmar(getDb(), id, new Date()));
}

export async function naoVou(): Promise<Resposta> {
  return comOJogador((id) => remover(getDb(), id, new Date()));
}

export async function queroEntrar(): Promise<Resposta> {
  return comOJogador((id) => entrarNaFila(getDb(), id, new Date()));
}
