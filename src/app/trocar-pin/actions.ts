'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { pinNovoValido } from '@/domain/pin';
import { trocarPin } from '@/server/auth';
import { criarSessaoJogador, lerSessaoJogador, sair } from '@/server/sessao';

/** Grava o PIN novo do jogador logado (sessão conferida no banco) e reemite o cookie. */
export async function salvarPin(novoPin: string): Promise<{ erro: 'pin_invalido' | 'falha' }> {
  const db = getDb();
  const sessao = await lerSessaoJogador(db);
  if (!sessao) redirect('/entrar');
  if (typeof novoPin !== 'string' || !pinNovoValido(novoPin)) return { erro: 'pin_invalido' };
  try {
    await trocarPin(db, sessao.jogadorId, novoPin);
  } catch (e) {
    console.error(e);
    return { erro: 'falha' };
  }
  // trocarPin subiu a versão de sessão (derruba os outros aparelhos); este recebe um
  // cookie novo com a versão atual e continua logado, já sem precisar trocar. Se só o cookie
  // falhar, a troca já valeu: dizer "falha" faria a pessoa criar o PIN de novo à toa (e o
  // antigo já não vale), então vai ao login com o aviso.
  let cookieNovo = true;
  try {
    await criarSessaoJogador(db, sessao.jogadorId);
  } catch (e) {
    console.error(e);
    cookieNovo = false;
  }
  if (!cookieNovo) redirect('/entrar?aviso=pin_trocado'); // fora do try: redirect lança
  redirect('/lista');
}

/** "Não é você?": apaga a sessão deste aparelho e volta para a escolha do nome. */
export async function sairDoPerfil(): Promise<void> {
  await sair('jogador');
  redirect('/entrar');
}
