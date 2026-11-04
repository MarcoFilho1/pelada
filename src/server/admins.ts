import { eq, sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { admins } from '@/db/schema';
import { MSG_SENHA_CURTA, senhaAdminValida } from '@/domain/admin';
import { conferirSegredo, hashSegredo } from './senha';

const TAM_MAX_USUARIO = 40;

export async function listarAdmins(db: DB): Promise<{ id: number; usuario: string }[]> {
  return db.select({ id: admins.id, usuario: admins.usuario }).from(admins).orderBy(admins.usuario);
}

export async function criarAdmin(db: DB, usuario: string, senha: string): Promise<{ id: number; usuario: string }> {
  const nome = usuario.trim();
  if (!nome) throw new Error('Preencha o usuário.');
  if (nome.length > TAM_MAX_USUARIO) throw new Error(`O usuário passa de ${TAM_MAX_USUARIO} letras.`);
  if (!senhaAdminValida(senha)) throw new Error(MSG_SENHA_CURTA);
  const [novo] = await db
    .insert(admins)
    .values({ usuario: nome, senhaHash: await hashSegredo(senha) })
    .onConflictDoNothing()
    .returning({ id: admins.id, usuario: admins.usuario });
  if (!novo) throw new Error(`Já existe um admin chamado ${nome}.`);
  return novo;
}

/**
 * Troca a senha do próprio admin: confere a atual, grava a nova e sobe `sessao_versao`
 * (derruba as sessões de todos os aparelhos; a action devolve um cookie novo ao aparelho atual).
 */
export async function trocarSenhaAdmin(db: DB, adminId: number, senhaAtual: string, nova: string): Promise<void> {
  if (!senhaAdminValida(nova)) throw new Error(MSG_SENHA_CURTA);
  const [adm] = await db.select({ senhaHash: admins.senhaHash }).from(admins).where(eq(admins.id, adminId));
  if (!adm) throw new Error(`Admin ${adminId} não encontrado`);
  if (!(await conferirSegredo(senhaAtual, adm.senhaHash))) throw new Error('A senha atual não confere.');
  await db
    .update(admins)
    .set({ senhaHash: await hashSegredo(nova), sessaoVersao: sql`${admins.sessaoVersao} + 1` })
    .where(eq(admins.id, adminId));
}
