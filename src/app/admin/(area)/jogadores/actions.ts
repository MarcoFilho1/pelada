'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { parseNomesColados } from '@/domain/nome';
import { atualizarJogador, criarJogadores, zerarPin } from '@/server/jogadores';
import { lerSessaoAdmin } from '@/server/sessao';

export type Resposta = { ok: true } | { ok: false; erro: string };

const TAM_MAX_TEXTO = 5_000;

async function exigirAdmin() {
  if (!(await lerSessaoAdmin(getDb()))) redirect('/admin/entrar');
}

async function tentar(fn: () => Promise<void>): Promise<Resposta> {
  try {
    await fn();
    revalidatePath('/admin/jogadores');
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'Não deu certo. Tente de novo.' };
  }
}

export async function colarNomes(texto: string): Promise<Resposta & { criados?: number; ignorados?: number }> {
  await exigirAdmin();
  if (typeof texto !== 'string') return { ok: false, erro: 'Texto inválido.' };
  try {
    const r = await criarJogadores(getDb(), parseNomesColados(texto.slice(0, TAM_MAX_TEXTO)));
    revalidatePath('/admin/jogadores');
    return { ok: true, criados: r.criados.length, ignorados: r.ignorados.length };
  } catch {
    return { ok: false, erro: 'Não deu para criar. Tente de novo.' };
  }
}

export async function mudarNota(id: number, nota: number): Promise<Resposta> {
  await exigirAdmin();
  if (!Number.isInteger(id) || typeof nota !== 'number') return { ok: false, erro: 'Pedido inválido.' };
  return tentar(() => atualizarJogador(getDb(), id, { nota }));
}

export async function mudarAtivo(id: number, ativo: boolean): Promise<Resposta> {
  await exigirAdmin();
  if (!Number.isInteger(id) || typeof ativo !== 'boolean') return { ok: false, erro: 'Pedido inválido.' };
  return tentar(() => atualizarJogador(getDb(), id, { ativo }));
}

export async function zerarPinDoJogador(id: number): Promise<Resposta> {
  await exigirAdmin();
  if (!Number.isInteger(id)) return { ok: false, erro: 'Pedido inválido.' };
  return tentar(() => zerarPin(getDb(), id));
}
