'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { pinNovoValido } from '@/domain/pin';
import { trocarPin } from '@/server/auth';
import { criarSessaoJogador, lerSessaoJogador } from '@/server/sessao';

/** Grava o PIN novo do jogador logado (sessão conferida no banco) e reemite o cookie. */
export async function salvarPin(novoPin: string): Promise<{ erro: 'pin_invalido' }> {
  const db = getDb();
  const sessao = await lerSessaoJogador(db);
  if (!sessao) redirect('/entrar');
  if (typeof novoPin !== 'string' || !pinNovoValido(novoPin)) return { erro: 'pin_invalido' };
  await trocarPin(db, sessao.jogadorId, novoPin);
  // mesma versão de sessão: este aparelho continua logado, agora sem precisar trocar
  await criarSessaoJogador(db, sessao.jogadorId);
  redirect('/lista');
}
