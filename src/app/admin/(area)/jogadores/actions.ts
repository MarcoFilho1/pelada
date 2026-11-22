'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { parseNomesColados } from '@/domain/nome';
import { idValido, mensagemParaUsuario } from '@/server/erros';
import { atualizarJogador, criarJogadores, NomeEmUsoError, zerarPin } from '@/server/jogadores';
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
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
}

export async function colarNomes(texto: string): Promise<Resposta & { criados?: number; ignorados?: number }> {
  await exigirAdmin();
  if (typeof texto !== 'string') return { ok: false, erro: 'Texto inválido.' };
  try {
    const r = await criarJogadores(getDb(), parseNomesColados(texto.slice(0, TAM_MAX_TEXTO)));
    revalidatePath('/admin/jogadores');
    return { ok: true, criados: r.criados.length, ignorados: r.ignorados.length };
  } catch (e) {
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
}

export async function mudarNota(id: number, nota: number): Promise<Resposta> {
  await exigirAdmin();
  if (!idValido(id) || typeof nota !== 'number') return { ok: false, erro: 'Pedido inválido.' };
  return tentar(() => atualizarJogador(getDb(), id, { nota }));
}

export async function mudarAtivo(id: number, ativo: boolean): Promise<Resposta> {
  await exigirAdmin();
  if (!idValido(id) || typeof ativo !== 'boolean') return { ok: false, erro: 'Pedido inválido.' };
  return tentar(() => atualizarJogador(getDb(), id, { ativo }));
}

export async function zerarPinDoJogador(id: number): Promise<Resposta> {
  await exigirAdmin();
  if (!idValido(id)) return { ok: false, erro: 'Pedido inválido.' };
  return tentar(() => zerarPin(getDb(), id));
}

export async function renomear(id: number, nome: string): Promise<Resposta> {
  await exigirAdmin();
  if (!idValido(id) || typeof nome !== 'string') return { ok: false, erro: 'Pedido inválido.' };
  try {
    await atualizarJogador(getDb(), id, { nome });
    revalidatePath('/admin/jogadores');
    return { ok: true };
  } catch (e) {
    if (e instanceof NomeEmUsoError) {
      return { ok: false, erro: 'Já existe um jogador com esse nome. Joao e João contam como o mesmo.' };
    }
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
}
