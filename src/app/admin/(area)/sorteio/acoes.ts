'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { CORES, diferenca, diferencaMedia, sortearComCompletes, type JogadorNota, type TimeSorteado } from '@/domain/sorteio';
import { idValido, mensagemParaUsuario } from '@/server/erros';
import { criarJogadores, listarJogadores, notaValida } from '@/server/jogadores';
import {
  adicionarComplete,
  moverJogador,
  mudarNotaComplete,
  preencherComplete,
  removerComplete,
  salvarTimesDefinitivos,
} from '@/server/times';
import { lerSessaoAdmin } from '@/server/sessao';

export type Resposta = { ok: true } | { ok: false; erro: string };
export type Proposta = { times: TimeSorteado[]; diferenca: number; diferencaMedia: number };

const PEDIDO_INVALIDO = { ok: false, erro: 'Pedido inválido.' } as const;
/** Bem mais que uma noite cheia; só barra pedido absurdo. */
const MAX_PARTICIPANTES = 64;
/** O sorteio completa cada time com COMPLETE até 4 (com 16 ou mais não entra COMPLETE: 17 viram 5,4,4,4). */
const POR_TIME = 4;

async function exigirAdmin() {
  if (!(await lerSessaoAdmin(getDb()))) redirect('/admin/entrar');
}

const listaDeIds = (v: unknown): v is number[] => Array.isArray(v) && v.length <= MAX_PARTICIPANTES && v.every(idValido);

/**
 * Sorteia uma proposta (não grava nada): até 4 times, equilibrados pela nota atual de cada um. Time
 * curto ganha COMPLETE até fechar 4, com a nota (2,5, 3,0 ou 3,5) que mais equilibra.
 */
export async function sortear(ids: number[]): Promise<({ ok: true } & Proposta) | { ok: false; erro: string }> {
  await exigirAdmin();
  if (!listaDeIds(ids)) return PEDIDO_INVALIDO;
  const unicos = [...new Set(ids)];
  if (unicos.length < 2) return { ok: false, erro: 'Marque pelo menos 2 jogadores.' };
  try {
    const ativos = new Map((await listarJogadores(getDb(), { incluirInativos: false })).map((j) => [j.id, j]));
    const participantes: JogadorNota[] = [];
    for (const id of unicos) {
      const j = ativos.get(id);
      if (!j) return { ok: false, erro: 'Tem jogador desativado ou que não existe. Recarregue a página.' };
      participantes.push({ id: j.id, nome: j.nome, nota: j.nota });
    }
    const times = sortearComCompletes(participantes, { times: Math.min(CORES.length, participantes.length), porTime: POR_TIME });
    return { ok: true, times, diferenca: diferenca(times), diferencaMedia: diferencaMedia(times) };
  } catch (e) {
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
}

async function tentar(fn: () => Promise<void>): Promise<Resposta> {
  try {
    await fn();
  } catch (e) {
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
  revalidatePath('/admin/sorteio');
  return { ok: true };
}

const notaOk = (v: unknown): v is number => typeof v === 'number' && notaValida(v);
const listaDeNotas = (v: unknown): v is number[] => Array.isArray(v) && v.length <= POR_TIME && v.every(notaOk);

/**
 * Grava os times da proposta (na ordem das cores) como os times da pelada; `completes[i]` são as
 * notas dos COMPLETE do time `i`. Com partidas já jogadas, os times antigos ficam arquivados.
 */
export async function marcarDefinitivo(peladaId: number, times: number[][], completes: number[][]): Promise<Resposta> {
  await exigirAdmin();
  if (
    !idValido(peladaId) ||
    !Array.isArray(times) ||
    times.length > CORES.length ||
    !times.every(listaDeIds) ||
    !Array.isArray(completes) ||
    completes.length > times.length ||
    !completes.every(listaDeNotas)
  ) {
    return PEDIDO_INVALIDO;
  }
  return tentar(() => salvarTimesDefinitivos(getDb(), peladaId, times, completes));
}

/** Põe um COMPLETE num time atual com vaga (menos de 4 entre jogadores e COMPLETE). */
export async function porComplete(timeId: number, nota: number): Promise<Resposta> {
  await exigirAdmin();
  if (!idValido(timeId) || !notaOk(nota)) return PEDIDO_INVALIDO;
  return tentar(async () => {
    await adicionarComplete(getDb(), timeId, nota);
  });
}

/** Tira o COMPLETE: o time joga com um a menos de propósito. */
export async function tirarComplete(completeId: number): Promise<Resposta> {
  await exigirAdmin();
  if (!idValido(completeId)) return PEDIDO_INVALIDO;
  return tentar(() => removerComplete(getDb(), completeId));
}

/** Nota do COMPLETE (0 a 5, de 0,5 em 0,5): só pesa no equilíbrio. */
export async function mudarNotaDoComplete(completeId: number, nota: number): Promise<Resposta> {
  await exigirAdmin();
  if (!idValido(completeId) || !notaOk(nota)) return PEDIDO_INVALIDO;
  return tentar(() => mudarNotaComplete(getDb(), completeId, nota));
}

/** Alguém sem time entra no lugar do COMPLETE e fica no time pelo resto da noite. */
export async function preencher(completeId: number, jogadorId: number): Promise<Resposta> {
  await exigirAdmin();
  if (!idValido(completeId) || !idValido(jogadorId)) return PEDIDO_INVALIDO;
  return tentar(() => preencherComplete(getDb(), completeId, jogadorId));
}

/** Entre partidas: muda de time (`de` → `para`), tira (`para` null) ou põe (`de` null). */
export async function mover(jogadorId: number, de: number | null, para: number | null): Promise<Resposta> {
  await exigirAdmin();
  const timeOk = (v: unknown) => v === null || idValido(v);
  if (!idValido(jogadorId) || !timeOk(de) || !timeOk(para)) return PEDIDO_INVALIDO;
  return tentar(() => moverJogador(getDb(), jogadorId, de, para));
}

/** Nota de quem acaba de ser cadastrado (o padrão da coluna `jogadores.nota`). */
const NOTA_INICIAL = 3;

/** Cadastro rápido na beira da quadra: só o nome, nota 3,0, PIN 1234. Devolve o jogador criado. */
export async function cadastrarRapido(nome: string): Promise<{ ok: true; jogador: JogadorNota } | { ok: false; erro: string }> {
  await exigirAdmin();
  if (typeof nome !== 'string' || !nome.trim()) return { ok: false, erro: 'Digite o nome.' };
  try {
    const db = getDb();
    const { criados } = await criarJogadores(db, [nome.slice(0, 200)]);
    if (!criados.length) {
      return {
        ok: false,
        erro: 'Já existe um jogador com esse nome (Joao e João contam como o mesmo). Se ele não aparece na busca, está desativado: reative em Jogadores.',
      };
    }
    revalidatePath('/admin/jogadores');
    return { ok: true, jogador: { id: criados[0].id, nome: criados[0].nome, nota: NOTA_INICIAL } };
  } catch (e) {
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
}
