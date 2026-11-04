'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { buscarJogadoresPorNome, entrarJogador } from '@/server/auth';
import { criarSessaoJogador } from '@/server/sessao';

const TAM_MAX_TERMO = 40;

export async function sugerirJogadores(termo: string): Promise<{ id: number; nome: string }[]> {
  if (typeof termo !== 'string') return [];
  return buscarJogadoresPorNome(getDb(), termo.slice(0, TAM_MAX_TERMO));
}

export type ErroEntrar = 'pin_errado' | 'bloqueado';

/** Confere o PIN; se certo, grava a sessão e redireciona (trocar PIN ou lista). */
export async function entrar(jogadorId: number, pin: string): Promise<{ erro: ErroEntrar }> {
  if (!Number.isInteger(jogadorId) || typeof pin !== 'string') return { erro: 'pin_errado' };
  const r = await entrarJogador(getDb(), jogadorId, pin, new Date());
  if (!r.ok) return { erro: r.motivo };
  await criarSessaoJogador(jogadorId, r.precisaTrocar);
  redirect(r.precisaTrocar ? '/trocar-pin' : '/lista');
}
