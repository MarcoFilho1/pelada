'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { pinNovoValido } from '@/domain/pin';
import { trocarPin } from '@/server/auth';
import { criarSessaoJogador, lerSessaoJogador } from '@/server/sessao';

/** Grava o PIN novo do jogador logado e reemite a sessão sem a obrigação de trocar. */
export async function salvarPin(novoPin: string): Promise<{ erro: 'pin_invalido' }> {
  const sessao = await lerSessaoJogador();
  if (!sessao) redirect('/entrar');
  if (typeof novoPin !== 'string' || !pinNovoValido(novoPin)) return { erro: 'pin_invalido' };
  await trocarPin(getDb(), sessao.jogadorId, novoPin);
  await criarSessaoJogador(sessao.jogadorId, false);
  redirect('/lista');
}
