'use server';

import { redirect } from 'next/navigation';
import { sair } from '@/server/sessao';

export async function sairDoAdmin(): Promise<void> {
  await sair('admin');
  redirect('/admin/entrar');
}
