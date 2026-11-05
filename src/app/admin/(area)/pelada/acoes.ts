'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import type { EstadoManual } from '@/domain/lista';
import { buscarJogadoresPorNome } from '@/server/auth';
import { idValido, mensagemParaUsuario } from '@/server/erros';
import { definirEstadoManual, obterPeladaDaSemana } from '@/server/pelada';
import { adminAdicionar, adminConfirmar, adminRemover } from '@/server/presencas';
import { lerSessaoAdmin } from '@/server/sessao';

export type Resposta = { ok: true } | { ok: false; erro: string };
export type EstadoEscolhido = 'automatico' | 'aberta' | 'fechada' | 'cancelada';

const ESTADOS: Record<EstadoEscolhido, EstadoManual> = {
  automatico: null,
  aberta: 'aberta',
  fechada: 'fechada',
  cancelada: 'cancelada',
};
const TAM_MAX_TERMO = 40;
const PEDIDO_INVALIDO: Resposta = { ok: false, erro: 'Pedido inválido.' };

async function exigirAdmin() {
  if (!(await lerSessaoAdmin(getDb()))) redirect('/admin/entrar');
}

/**
 * Roda a mudança na pelada da tela. `null` = a pelada da semana ainda não existia quando a tela
 * abriu (antes de segunda 00:00): a primeira ação do admin a cria.
 */
async function naPelada(peladaId: number | null, fn: (peladaId: number) => Promise<void>): Promise<Resposta> {
  await exigirAdmin();
  if (peladaId !== null && !idValido(peladaId)) return PEDIDO_INVALIDO;
  try {
    const id = peladaId ?? (await obterPeladaDaSemana(getDb(), new Date())).id;
    await fn(id);
  } catch (e) {
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
  revalidatePath('/admin/pelada');
  revalidatePath('/lista');
  return { ok: true };
}

export async function mudarEstado(peladaId: number | null, estado: EstadoEscolhido): Promise<Resposta> {
  if (typeof estado !== 'string' || !Object.hasOwn(ESTADOS, estado)) {
    await exigirAdmin();
    return PEDIDO_INVALIDO;
  }
  return naPelada(peladaId, (id) => definirEstadoManual(getDb(), id, ESTADOS[estado]));
}

export async function adicionar(peladaId: number | null, jogadorId: number): Promise<Resposta> {
  if (!idValido(jogadorId)) {
    await exigirAdmin();
    return PEDIDO_INVALIDO;
  }
  return naPelada(peladaId, (id) => adminAdicionar(getDb(), id, jogadorId, new Date()));
}

export async function confirmarPor(peladaId: number | null, jogadorId: number): Promise<Resposta> {
  if (!idValido(jogadorId)) {
    await exigirAdmin();
    return PEDIDO_INVALIDO;
  }
  return naPelada(peladaId, (id) => adminConfirmar(getDb(), id, jogadorId, new Date()));
}

export async function tirar(peladaId: number | null, jogadorId: number): Promise<Resposta> {
  if (!idValido(jogadorId)) {
    await exigirAdmin();
    return PEDIDO_INVALIDO;
  }
  return naPelada(peladaId, (id) => adminRemover(getDb(), id, jogadorId, new Date()));
}

/** Jogadores ativos pelo nome, sem diferenciar acento (Joao acha João). */
export async function buscar(termo: string): Promise<{ id: number; nome: string }[]> {
  await exigirAdmin();
  if (typeof termo !== 'string') return [];
  try {
    return await buscarJogadoresPorNome(getDb(), termo.slice(0, TAM_MAX_TERMO));
  } catch (e) {
    console.error(e);
    return [];
  }
}
