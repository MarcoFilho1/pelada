'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { trocarPinComAtual } from '@/server/auth';
import { criarSessaoJogador, lerSessaoJogador, sair } from '@/server/sessao';

export type RespostaPin =
  | { ok: true }
  | { ok: false; erro: 'pin_errado' | 'pin_invalido' | 'falha' }
  | { ok: false; erro: 'bloqueado'; bloqueadoAte: string };

/**
 * Troca o PIN do jogador logado pedindo o atual. O id vem só da sessão. PIN atual errado
 * conta para o bloqueio de 5 erros / 15 min. Deu certo: as outras sessões caem e este
 * aparelho recebe um cookie novo, continuando logado.
 */
export async function trocarMeuPin(atual: unknown, novo: unknown): Promise<RespostaPin> {
  const db = getDb();
  const sessao = await lerSessaoJogador(db);
  if (!sessao) redirect('/entrar');
  if (sessao.precisaTrocar) redirect('/trocar-pin');
  if (typeof atual !== 'string' || typeof novo !== 'string') return { ok: false, erro: 'pin_invalido' };
  try {
    const r = await trocarPinComAtual(db, sessao.jogadorId, atual, novo, new Date());
    if (!r.ok) {
      return r.motivo === 'bloqueado'
        ? { ok: false, erro: 'bloqueado', bloqueadoAte: r.bloqueadoAte.toISOString() }
        : { ok: false, erro: r.motivo };
    }
  } catch (e) {
    console.error(e);
    return { ok: false, erro: 'falha' };
  }
  // A troca já valeu e derrubou as sessões. Se só o cookie novo falhar, dizer "falha" faria a pessoa
  // tentar de novo com o PIN antigo (que já não vale): leva ao login com o aviso.
  let cookieNovo = true;
  try {
    await criarSessaoJogador(db, sessao.jogadorId);
  } catch (e) {
    console.error(e);
    cookieNovo = false;
  }
  if (!cookieNovo) redirect('/entrar?aviso=pin_trocado'); // fora do try: redirect lança
  return { ok: true };
}

/** Apaga a sessão deste aparelho e volta para a escolha do nome. */
export async function sairDaConta(): Promise<void> {
  await sair('jogador');
  redirect('/entrar');
}
