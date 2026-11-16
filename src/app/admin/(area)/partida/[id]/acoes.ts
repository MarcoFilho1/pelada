'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import type { TipoLance } from '@/domain/partida';
import { idValido, mensagemParaUsuario } from '@/server/erros';
import { corrigirContagem, desfazerUltimo, encerrarPartida, registrarLance } from '@/server/partidas';
import { peladaDaPartida } from '@/server/anotador';
import { acessoNaPelada, destinoSemAcesso, lerAcessoPartidas } from '@/server/sessao';
import { lerEstado, type EstadoDaPartida } from './estado';

export type RespostaPartida = { ok: true; estado: EstadoDaPartida } | { ok: false; erro: string };
/** `estado: null`: a mudança gravou, mas a leitura logo depois falhou; a tela confere na próxima leitura da página. */
export type RespostaDeEscrita = { ok: true; estado: EstadoDaPartida | null } | { ok: false; erro: string };
/** Como `RespostaDeEscrita`, com `desfeito`: o servidor apagou o lance (false: já não era o último). */
export type RespostaDeDesfazer = { ok: true; estado: EstadoDaPartida | null; desfeito: boolean } | { ok: false; erro: string };

const PEDIDO_INVALIDO = { ok: false, erro: 'Pedido inválido.' } as const;
const TIPOS: readonly unknown[] = ['gol', 'assistencia'] satisfies TipoLance[];
const tipoValido = (v: unknown): v is TipoLance => TIPOS.includes(v);

/** Admin, ou o anotador do link de hoje se a partida é da pelada dele. */
async function exigirAcesso(partidaId: number) {
  const db = getDb();
  const acesso = await lerAcessoPartidas(db);
  if (acesso?.tipo === 'admin') return;
  if (!acessoNaPelada(acesso, idValido(partidaId) ? await peladaDaPartida(db, partidaId) : null)) redirect(destinoSemAcesso(acesso));
}

/**
 * Roda a mudança e devolve a partida lida logo depois, para a tela conferir o que mostrou. Se a
 * mudança gravou e só a leitura falhou, é sucesso com `estado: null`: dar erro aqui faria a pessoa
 * tocar de novo e contar em dobro.
 */
async function eDepoisLer(partidaId: number, fn: () => Promise<unknown>): Promise<RespostaDeEscrita> {
  try {
    await fn();
  } catch (e) {
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
  const estado = await lerEstado(getDb(), partidaId).catch((e: unknown) => {
    console.error(e);
    return null;
  });
  return { ok: true, estado };
}

/** Um toque em GOL ou AST: um lance. Devolve também o id dele (o Desfazer de um toque recém-feito usa). */
export async function anotar(
  partidaId: number,
  jogadorId: number,
  tipo: TipoLance,
): Promise<{ ok: true; estado: EstadoDaPartida | null; lanceId: number } | { ok: false; erro: string }> {
  await exigirAcesso(partidaId);
  if (!idValido(partidaId) || !idValido(jogadorId) || !tipoValido(tipo)) return PEDIDO_INVALIDO;
  let lanceId = 0;
  const r = await eDepoisLer(partidaId, async () => {
    lanceId = await registrarLance(getDb(), partidaId, jogadorId, tipo);
  });
  return r.ok ? { ...r, lanceId } : r;
}

/**
 * Desfaz o lance que a tela mostrava como último (`esperadoId`). Se ele já não for o último
 * (outro admin desfez, ou entrou lance novo), não mexe em nada: a tela compara com o estado novo.
 */
export async function desfazer(partidaId: number, esperadoId: number): Promise<RespostaDeDesfazer> {
  await exigirAcesso(partidaId);
  if (!idValido(partidaId) || !idValido(esperadoId)) return PEDIDO_INVALIDO;
  let apagado: number | null = null;
  const r = await eDepoisLer(partidaId, async () => {
    apagado = await desfazerUltimo(getDb(), partidaId, esperadoId);
  });
  return r.ok ? { ...r, desfeito: apagado !== null } : r;
}

/** Encerra com o placar de agora e volta para a noite (histórico). */
export async function encerrar(partidaId: number): Promise<{ ok: false; erro: string }> {
  await exigirAcesso(partidaId);
  if (!idValido(partidaId)) return PEDIDO_INVALIDO;
  try {
    await encerrarPartida(getDb(), partidaId, new Date());
  } catch (e) {
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
  redirect('/admin/partidas');
}

/** Corrigir partida encerrada: +1 ou −1 num gol ou assistência de um jogador. */
export async function corrigir(partidaId: number, jogadorId: number, tipo: TipoLance, delta: 1 | -1): Promise<RespostaPartida> {
  await exigirAcesso(partidaId);
  if (!idValido(partidaId) || !idValido(jogadorId) || !tipoValido(tipo) || (delta !== 1 && delta !== -1)) return PEDIDO_INVALIDO;
  const r = await eDepoisLer(partidaId, () => corrigirContagem(getDb(), partidaId, jogadorId, tipo, delta));
  if (r.ok && !r.estado) return { ok: false, erro: 'Salvou, mas não deu para ler a partida. Recarregue a página.' };
  return r as RespostaPartida;
}
