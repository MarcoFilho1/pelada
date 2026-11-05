'use server';

import { eq, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { jogadores } from '@/db/schema';
import { CORES, diferenca, diferencaMedia, sortearTimes, type JogadorNota, type TimeSorteado } from '@/domain/sorteio';
import { idValido, mensagemParaUsuario } from '@/server/erros';
import { criarJogadores, listarJogadores } from '@/server/jogadores';
import { moverJogador, salvarTimesDefinitivos } from '@/server/times';
import { lerSessaoAdmin } from '@/server/sessao';

export type Resposta = { ok: true } | { ok: false; erro: string };
export type Proposta = { times: TimeSorteado[]; diferenca: number; diferencaMedia: number };

const PEDIDO_INVALIDO = { ok: false, erro: 'Pedido inválido.' } as const;
/** Bem mais que uma noite cheia; só barra pedido absurdo. */
const MAX_PARTICIPANTES = 64;

async function exigirAdmin() {
  if (!(await lerSessaoAdmin(getDb()))) redirect('/admin/entrar');
}

const listaDeIds = (v: unknown): v is number[] => Array.isArray(v) && v.length <= MAX_PARTICIPANTES && v.every(idValido);

/** Sorteia uma proposta (não grava nada): até 4 times, equilibrados pela nota atual de cada um. */
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
    const times = sortearTimes(participantes, { times: Math.min(CORES.length, participantes.length) });
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

/** Grava os times da proposta (na ordem das cores) como os times da pelada. */
export async function marcarDefinitivo(peladaId: number, times: number[][]): Promise<Resposta> {
  await exigirAdmin();
  if (!idValido(peladaId) || !Array.isArray(times) || times.length > CORES.length || !times.every(listaDeIds)) {
    return PEDIDO_INVALIDO;
  }
  return tentar(() => salvarTimesDefinitivos(getDb(), peladaId, times));
}

/** Entre partidas: muda de time (`de` → `para`), tira (`para` null) ou põe (`de` null). */
export async function mover(jogadorId: number, de: number | null, para: number | null): Promise<Resposta> {
  await exigirAdmin();
  const timeOk = (v: unknown) => v === null || idValido(v);
  if (!idValido(jogadorId) || !timeOk(de) || !timeOk(para)) return PEDIDO_INVALIDO;
  return tentar(() => moverJogador(getDb(), jogadorId, de, para));
}

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
    const [j] = await db
      .select({ id: jogadores.id, nome: jogadores.nome, nota: jogadores.nota })
      .from(jogadores)
      .where(eq(sql`lower(${jogadores.nome})`, criados[0].toLowerCase()));
    revalidatePath('/admin/jogadores');
    return { ok: true, jogador: { id: j.id, nome: j.nome, nota: Number(j.nota) } };
  } catch (e) {
    return { ok: false, erro: mensagemParaUsuario(e) };
  }
}
