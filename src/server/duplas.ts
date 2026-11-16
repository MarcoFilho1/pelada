// Duplas separadas: pares de jogadores que o sorteio (site e robô) nunca põe no mesmo time.
import { asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DB } from '@/db/client';
import { duplasSeparadas, jogadores } from '@/db/schema';
import { ErroDeValidacao } from './erros';

export type Dupla = { id: number; a: { id: number; nome: string }; b: { id: number; nome: string } };

/** As duplas com os nomes, em ordem alfabética do primeiro nome. */
export async function listarDuplas(db: DB): Promise<Dupla[]> {
  const ja = alias(jogadores, 'ja');
  const jb = alias(jogadores, 'jb');
  const linhas = await db
    .select({ id: duplasSeparadas.id, aId: ja.id, aNome: ja.nome, bId: jb.id, bNome: jb.nome })
    .from(duplasSeparadas)
    .innerJoin(ja, eq(ja.id, duplasSeparadas.jogadorAId))
    .innerJoin(jb, eq(jb.id, duplasSeparadas.jogadorBId))
    .orderBy(asc(duplasSeparadas.id));
  return linhas
    .map((l) => {
      const [a, b] = [{ id: l.aId, nome: l.aNome }, { id: l.bId, nome: l.bNome }].sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
      return { id: l.id, a, b };
    })
    .sort((x, y) => x.a.nome.localeCompare(y.a.nome, 'pt-BR') || x.b.nome.localeCompare(y.b.nome, 'pt-BR'));
}

/** Só os pares de ids, como o sorteio recebe. */
export async function paresSeparados(db: DB): Promise<[number, number][]> {
  const linhas = await db.select({ a: duplasSeparadas.jogadorAId, b: duplasSeparadas.jogadorBId }).from(duplasSeparadas);
  return linhas.map((l) => [l.a, l.b]);
}

/** Separa dois jogadores (a ordem não importa). Mesma pessoa ou dupla já existente: recusa. */
export async function adicionarDupla(db: DB, um: number, outro: number): Promise<void> {
  if (um === outro) throw new ErroDeValidacao('Escolha duas pessoas diferentes.');
  const [a, b] = um < outro ? [um, outro] : [outro, um];
  const existentes = await db.select({ id: jogadores.id }).from(jogadores).where(eq(jogadores.id, a));
  const existentesB = await db.select({ id: jogadores.id }).from(jogadores).where(eq(jogadores.id, b));
  if (!existentes.length || !existentesB.length) throw new ErroDeValidacao('Jogador não encontrado. Recarregue a página.');
  const [nova] = await db.insert(duplasSeparadas).values({ jogadorAId: a, jogadorBId: b }).onConflictDoNothing().returning({ id: duplasSeparadas.id });
  if (!nova) throw new ErroDeValidacao('Essa dupla já está separada.');
}

export async function removerDupla(db: DB, id: number): Promise<void> {
  await db.delete(duplasSeparadas).where(eq(duplasSeparadas.id, id));
}
