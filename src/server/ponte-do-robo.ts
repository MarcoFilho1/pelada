import { and, asc, eq, gte, lt } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { roboDiario, roboRecados } from '@/db/schema';

// A ponte entre o robô que roda num celular e o Mac da auto-revisão: o diário (conversas e
// registro, para a revisão ler) e os recados (o resultado da revisão, o "pode mergear", o fim do merge).

export type TipoDoDiario = 'conversa' | 'log';
const DIAS_DO_DIARIO = 7;
/** Uma linha do registro maior que isto é cortada (uma resposta inteira da IA não precisa ir). */
const TAMANHO_DA_LINHA = 2_000;

export async function anotarNoDiario(db: DB, tipo: TipoDoDiario, dados: string, quando: Date): Promise<void> {
  await db.insert(roboDiario).values({ tipo, dados: dados.slice(0, tipo === 'log' ? TAMANHO_DA_LINHA : 20_000), quando });
}

/** O que foi anotado de `desde` até `ate` (sem incluir), do mais antigo ao mais novo. */
export async function lerDiario(db: DB, tipo: TipoDoDiario, desde: Date, ate: Date): Promise<{ quando: Date; dados: string }[]> {
  return db
    .select({ quando: roboDiario.quando, dados: roboDiario.dados })
    .from(roboDiario)
    .where(and(eq(roboDiario.tipo, tipo), gte(roboDiario.quando, desde), lt(roboDiario.quando, ate)))
    .orderBy(asc(roboDiario.quando), asc(roboDiario.id));
}

/** Apaga o que tem mais de 7 dias; devolve quantas linhas saíram. */
export async function limparDiarioDoBanco(db: DB, agora: Date): Promise<number> {
  const limite = new Date(agora.getTime() - DIAS_DO_DIARIO * 24 * 60 * 60 * 1000);
  const apagadas = await db.delete(roboDiario).where(lt(roboDiario.quando, limite)).returning({ id: roboDiario.id });
  return apagadas.length;
}

export async function lerRecado(db: DB, nome: string): Promise<string | null> {
  const [r] = await db.select({ dados: roboRecados.dados }).from(roboRecados).where(eq(roboRecados.nome, nome)).limit(1);
  return r?.dados ?? null;
}

export async function gravarRecado(db: DB, nome: string, dados: string, agora: Date): Promise<void> {
  await db.insert(roboRecados).values({ nome, dados, quando: agora }).onConflictDoUpdate({ target: roboRecados.nome, set: { dados, quando: agora } });
}

export async function apagarRecado(db: DB, nome: string): Promise<void> {
  await db.delete(roboRecados).where(eq(roboRecados.nome, nome));
}

/** Lê e apaga de uma vez: dois leitores nunca recebem o mesmo recado. */
export async function tirarRecado(db: DB, nome: string): Promise<string | null> {
  const [r] = await db.delete(roboRecados).where(eq(roboRecados.nome, nome)).returning({ dados: roboRecados.dados });
  return r?.dados ?? null;
}
