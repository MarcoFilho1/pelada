'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { buscarJogadoresPorNome, entrarJogador } from '@/server/auth';
import { idValido } from '@/server/erros';
import { criarSessaoJogador } from '@/server/sessao';

const TAM_MAX_TERMO = 40;

export async function sugerirJogadores(termo: string): Promise<{ id: number; nome: string }[]> {
  if (typeof termo !== 'string') return [];
  try {
    return await buscarJogadoresPorNome(getDb(), termo.slice(0, TAM_MAX_TERMO));
  } catch (e) {
    console.error(e);
    return [];
  }
}

export type ErroEntrar = { motivo: 'pin_errado' } | { motivo: 'bloqueado'; bloqueadoAte: string } | { motivo: 'falha' };

/** Confere o PIN; se certo, grava a sessão e redireciona (trocar PIN ou lista). */
export async function entrar(jogadorId: number, pin: string): Promise<{ erro: ErroEntrar }> {
  if (!idValido(jogadorId) || typeof pin !== 'string') return { erro: { motivo: 'pin_errado' } };
  const db = getDb();
  let precisaTrocar: boolean;
  try {
    const r = await entrarJogador(db, jogadorId, pin, new Date());
    if (!r.ok) {
      return { erro: r.motivo === 'bloqueado' ? { motivo: 'bloqueado', bloqueadoAte: r.bloqueadoAte.toISOString() } : { motivo: 'pin_errado' } };
    }
    await criarSessaoJogador(db, jogadorId);
    precisaTrocar = r.precisaTrocar;
  } catch (e) {
    console.error(e);
    return { erro: { motivo: 'falha' } };
  }
  redirect(precisaTrocar ? '/trocar-pin' : '/lista');
}
