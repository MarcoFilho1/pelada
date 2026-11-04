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

export type ErroEntrar = { motivo: 'pin_errado' } | { motivo: 'bloqueado'; bloqueadoAte: string };

/** Confere o PIN; se certo, grava a sessão e redireciona (trocar PIN ou lista). */
export async function entrar(jogadorId: number, pin: string): Promise<{ erro: ErroEntrar }> {
  if (!Number.isInteger(jogadorId) || typeof pin !== 'string') return { erro: { motivo: 'pin_errado' } };
  const db = getDb();
  const r = await entrarJogador(db, jogadorId, pin, new Date());
  if (!r.ok) {
    return { erro: r.motivo === 'bloqueado' ? { motivo: 'bloqueado', bloqueadoAte: r.bloqueadoAte.toISOString() } : { motivo: 'pin_errado' } };
  }
  await criarSessaoJogador(db, jogadorId);
  redirect(r.precisaTrocar ? '/trocar-pin' : '/lista');
}
