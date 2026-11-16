'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { adicionarDupla, removerDupla } from '@/server/duplas';
import { idValido, mensagemParaUsuario } from '@/server/erros';
import { lerSessaoAdmin } from '@/server/sessao';

export type EstadoDupla = { ok: boolean; mensagem: string | null };

async function exigirAdmin() {
  if (!(await lerSessaoAdmin(getDb()))) redirect('/admin/entrar');
}

/** Separa os dois escolhidos no formulário. */
export async function separar(_antes: EstadoDupla, form: FormData): Promise<EstadoDupla> {
  await exigirAdmin();
  const a = Number(form.get('a'));
  const b = Number(form.get('b'));
  if (!idValido(a) || !idValido(b)) return { ok: false, mensagem: 'Escolha as duas pessoas.' };
  try {
    await adicionarDupla(getDb(), a, b);
  } catch (e) {
    return { ok: false, mensagem: mensagemParaUsuario(e) };
  }
  revalidatePath('/admin/sorteio/duplas');
  return { ok: true, mensagem: 'Dupla separada. Os próximos sorteios (site e robô) já respeitam.' };
}

export async function juntarDeNovo(form: FormData): Promise<void> {
  await exigirAdmin();
  const id = Number(form.get('id'));
  if (idValido(id)) await removerDupla(getDb(), id);
  revalidatePath('/admin/sorteio/duplas');
}
