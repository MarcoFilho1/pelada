'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { entrarAdmin } from '@/server/auth';
import { criarSessaoAdmin } from '@/server/sessao';

export type EstadoEntrarAdmin = { erro: string | null; usuario: string };

export async function entrarComoAdmin(_anterior: EstadoEntrarAdmin, form: FormData): Promise<EstadoEntrarAdmin> {
  const usuario = String(form.get('usuario') ?? '').trim();
  const senha = String(form.get('senha') ?? '');
  if (!usuario || !senha) return { erro: 'Preencha usuário e senha.', usuario };

  const r = await entrarAdmin(getDb(), usuario, senha);
  if (!r.ok || !r.adminId) return { erro: 'Usuário ou senha errados.', usuario };
  await criarSessaoAdmin(r.adminId);
  redirect('/admin');
}
