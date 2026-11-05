'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { senhaAdminValida } from '@/domain/admin';
import { criarAdmin, trocarSenhaAdmin } from '@/server/admins';
import { mensagemParaUsuario } from '@/server/erros';
import { criarSessaoAdmin, lerSessaoAdmin } from '@/server/sessao';

export type EstadoForm = { ok: boolean; mensagem: string | null; usuario?: string; campo?: 'usuario' | 'senha' };

async function exigirAdmin() {
  const sessao = await lerSessaoAdmin(getDb());
  if (!sessao) redirect('/admin/entrar');
  return sessao;
}

export async function novoAdmin(_antes: EstadoForm, form: FormData): Promise<EstadoForm> {
  await exigirAdmin();
  const usuario = String(form.get('usuario') ?? '').trim();
  const senha = String(form.get('senha') ?? '');
  try {
    await criarAdmin(getDb(), usuario, senha);
  } catch (e) {
    return { ok: false, mensagem: mensagemParaUsuario(e), usuario, campo: senhaAdminValida(senha) ? 'usuario' : 'senha' };
  }
  revalidatePath('/admin/admins');
  return { ok: true, mensagem: `Admin ${usuario} criado.` };
}

export async function trocarMinhaSenha(_antes: EstadoForm, form: FormData): Promise<EstadoForm> {
  const { adminId } = await exigirAdmin();
  const db = getDb();
  try {
    await trocarSenhaAdmin(db, adminId, String(form.get('atual') ?? ''), String(form.get('nova') ?? ''));
    // A versão subiu e derrubou todos os aparelhos; este recebe cookie novo e segue logado.
    await criarSessaoAdmin(db, adminId);
  } catch (e) {
    return { ok: false, mensagem: mensagemParaUsuario(e) };
  }
  return { ok: true, mensagem: 'Senha trocada. Os outros aparelhos saíram da conta.' };
}
