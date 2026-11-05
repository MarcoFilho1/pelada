import { eq, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { DB } from '@/db/client';
import { jogadores } from '@/db/schema';
import { normalizarNome, parseNomesColados, separarNomes, TAM_MAX_NOME } from '@/domain/nome';
import { ErroDeValidacao } from './erros';

export { parseNomesColados };

/**
 * Cria jogadores com nota 3,0 e PIN padrão (`pin_hash` nulo, troca obrigatória).
 * Nome vazio, grande demais ou já existente (Joao = João = JOÃO, até de inativos) é ignorado.
 */
export async function criarJogadores(db: DB, nomes: string[]): Promise<{ criados: string[]; ignorados: string[] }> {
  const existentes = await db.select({ nome: jogadores.nome }).from(jogadores);
  const { criar, ignorar } = separarNomes(
    nomes,
    existentes.map((j) => j.nome),
  );
  const criados: string[] = [];
  const ignorados = [...ignorar];
  for (const nome of criar) {
    // O índice único em lower(nome) segura dois cadastros simultâneos do mesmo nome.
    const inseridos = await db.insert(jogadores).values({ nome }).onConflictDoNothing().returning({ id: jogadores.id });
    (inseridos.length ? criados : ignorados).push(nome);
  }
  return { criados, ignorados };
}

/** Nota válida: de 0 a 5, de meio em meio ponto. */
export function notaValida(nota: number): boolean {
  return Number.isFinite(nota) && nota >= 0 && nota <= 5 && Number.isInteger(nota * 2);
}

/** Outro jogador já tem esse nome (Joao e João contam como o mesmo). */
export class NomeEmUsoError extends ErroDeValidacao {
  constructor(nome: string) {
    super(`Já existe um jogador chamado ${nome}.`);
    this.name = 'NomeEmUsoError';
  }
}

export async function atualizarJogador(
  db: DB,
  id: number,
  mudancas: { nome?: string; nota?: number; ativo?: boolean },
): Promise<void> {
  const set: PgUpdateSetSource<typeof jogadores> = {};

  if (mudancas.nota !== undefined) {
    if (!notaValida(mudancas.nota)) throw new ErroDeValidacao(`Nota inválida: ${mudancas.nota}. Use de 0 a 5, de 0,5 em 0,5.`);
    set.nota = mudancas.nota.toFixed(1);
  }
  if (mudancas.ativo !== undefined) set.ativo = mudancas.ativo;
  // Desativar derruba as sessões no mesmo UPDATE: sem janela entre uma coisa e outra.
  if (mudancas.ativo === false) set.sessaoVersao = sql`${jogadores.sessaoVersao} + 1`;
  if (mudancas.nome !== undefined) {
    const nome = mudancas.nome.trim().replace(/\s+/g, ' ');
    if (!nome) throw new ErroDeValidacao('O nome não pode ficar vazio.');
    if (nome.length > TAM_MAX_NOME) throw new ErroDeValidacao(`O nome passa de ${TAM_MAX_NOME} letras.`);
    const todos = await db.select({ id: jogadores.id, nome: jogadores.nome }).from(jogadores);
    const chave = normalizarNome(nome);
    if (todos.some((j) => j.id !== id && normalizarNome(j.nome) === chave)) {
      throw new NomeEmUsoError(nome);
    }
    set.nome = nome;
  }

  if (Object.keys(set).length > 0) {
    const atualizados = await db.update(jogadores).set(set).where(eq(jogadores.id, id)).returning({ id: jogadores.id });
    if (atualizados.length === 0) throw new ErroDeValidacao('Jogador não encontrado. Recarregue a página.');
  } else {
    const [existe] = await db.select({ id: jogadores.id }).from(jogadores).where(eq(jogadores.id, id));
    if (!existe) throw new ErroDeValidacao('Jogador não encontrado. Recarregue a página.');
  }
}

/** Volta o PIN para 1234 (`pin_hash` nulo), exige troca, limpa erros e bloqueio e derruba as sessões. */
export async function zerarPin(db: DB, id: number): Promise<void> {
  const atualizados = await db
    .update(jogadores)
    .set({
      pinHash: null,
      pinPrecisaTrocar: true,
      pinErros: 0,
      bloqueadoAte: null,
      sessaoVersao: sql`${jogadores.sessaoVersao} + 1`, // no mesmo UPDATE: derruba as sessões sem janela
    })
    .where(eq(jogadores.id, id))
    .returning({ id: jogadores.id });
  if (atualizados.length === 0) throw new ErroDeValidacao('Jogador não encontrado. Recarregue a página.');
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

/** Nota do jogador (0 a 5, passo 0,5); `null` se ele não existe. */
export async function notaDoJogador(db: DB, id: number): Promise<number | null> {
  const [j] = await db.select({ nota: jogadores.nota }).from(jogadores).where(eq(jogadores.id, id));
  return j ? Number(j.nota) : null;
}
