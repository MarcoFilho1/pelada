import { eq } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { jogadores } from '@/db/schema';
import { normalizarNome } from '@/domain/nome';
import { revogarSessoesJogador } from './auth';

export const NOTA_PADRAO = 3;
export const TAM_MAX_NOME = 60;

/**
 * Lista colada do WhatsApp para nomes: um por linha, sem numeração ("3. "), sem as marcas
 * (M), (D), (?) e sem os emojis ✅ ⏳. Linhas que sobram vazias somem.
 */
export function parseNomesColados(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((linha) =>
      linha
        .replace(/^\s*\d+\s*[.):\-–]\s*/, '')
        .replace(/\((?:M|D|\?)\)/gi, '')
        .replace(/[✅⏳️]/gu, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((nome) => nome !== '');
}

/**
 * Cria jogadores com nota 3,0 e PIN padrão (`pin_hash` nulo, troca obrigatória).
 * Nome vazio, grande demais ou já existente (Joao = João = JOÃO, até de inativos) é ignorado.
 */
export async function criarJogadores(db: DB, nomes: string[]): Promise<{ criados: string[]; ignorados: string[] }> {
  const existentes = await db.select({ nome: jogadores.nome }).from(jogadores);
  const usados = new Set(existentes.map((j) => normalizarNome(j.nome)));
  const criados: string[] = [];
  const ignorados: string[] = [];

  for (const bruto of nomes) {
    const nome = bruto.trim().replace(/\s+/g, ' ');
    if (!nome) continue;
    const chave = normalizarNome(nome);
    if (nome.length > TAM_MAX_NOME || usados.has(chave)) {
      ignorados.push(nome);
      continue;
    }
    // O índice único em lower(nome) segura dois cadastros simultâneos do mesmo nome.
    const inseridos = await db
      .insert(jogadores)
      .values({ nome })
      .onConflictDoNothing()
      .returning({ id: jogadores.id });
    usados.add(chave);
    (inseridos.length ? criados : ignorados).push(nome);
  }
  return { criados, ignorados };
}

/** Nota válida: de 0 a 5, de meio em meio ponto. */
export function notaValida(nota: number): boolean {
  return Number.isFinite(nota) && nota >= 0 && nota <= 5 && Number.isInteger(nota * 2);
}

export async function atualizarJogador(
  db: DB,
  id: number,
  mudancas: { nome?: string; nota?: number; ativo?: boolean },
): Promise<void> {
  const set: Partial<typeof jogadores.$inferInsert> = {};

  if (mudancas.nota !== undefined) {
    if (!notaValida(mudancas.nota)) throw new Error(`Nota inválida: ${mudancas.nota}. Use de 0 a 5, de 0,5 em 0,5.`);
    set.nota = mudancas.nota.toFixed(1);
  }
  if (mudancas.ativo !== undefined) set.ativo = mudancas.ativo;
  if (mudancas.nome !== undefined) {
    const nome = mudancas.nome.trim().replace(/\s+/g, ' ');
    if (!nome) throw new Error('O nome não pode ficar vazio.');
    if (nome.length > TAM_MAX_NOME) throw new Error(`O nome passa de ${TAM_MAX_NOME} letras.`);
    const todos = await db.select({ id: jogadores.id, nome: jogadores.nome }).from(jogadores);
    const chave = normalizarNome(nome);
    if (todos.some((j) => j.id !== id && normalizarNome(j.nome) === chave)) {
      throw new Error(`Já existe um jogador chamado ${nome}.`);
    }
    set.nome = nome;
  }

  if (Object.keys(set).length > 0) {
    const atualizados = await db.update(jogadores).set(set).where(eq(jogadores.id, id)).returning({ id: jogadores.id });
    if (atualizados.length === 0) throw new Error(`Jogador ${id} não encontrado`);
  } else {
    const [existe] = await db.select({ id: jogadores.id }).from(jogadores).where(eq(jogadores.id, id));
    if (!existe) throw new Error(`Jogador ${id} não encontrado`);
  }
  if (mudancas.ativo === false) await revogarSessoesJogador(db, id);
}

/** Volta o PIN para 1234 (`pin_hash` nulo), exige troca, limpa erros e bloqueio e derruba as sessões. */
export async function zerarPin(db: DB, id: number): Promise<void> {
  const atualizados = await db
    .update(jogadores)
    .set({ pinHash: null, pinPrecisaTrocar: true, pinErros: 0, bloqueadoAte: null })
    .where(eq(jogadores.id, id))
    .returning({ id: jogadores.id });
  if (atualizados.length === 0) throw new Error(`Jogador ${id} não encontrado`);
  await revogarSessoesJogador(db, id);
}

export type JogadorListado = {
  id: number;
  nome: string;
  nota: number;
  ativo: boolean;
  /** Ainda no PIN 1234 (nunca criou o seu ou o admin zerou). */
  pinPadrao: boolean;
};

export async function listarJogadores(db: DB, { incluirInativos }: { incluirInativos: boolean }): Promise<JogadorListado[]> {
  const linhas = await db
    .select({
      id: jogadores.id,
      nome: jogadores.nome,
      nota: jogadores.nota,
      ativo: jogadores.ativo,
      pinHash: jogadores.pinHash,
    })
    .from(jogadores)
    .where(incluirInativos ? undefined : eq(jogadores.ativo, true));
  return linhas
    .map((j) => ({ id: j.id, nome: j.nome, nota: Number(j.nota), ativo: j.ativo, pinPadrao: j.pinHash === null }))
    .sort((a, b) => normalizarNome(a.nome).localeCompare(normalizarNome(b.nome), 'pt-BR'));
}
