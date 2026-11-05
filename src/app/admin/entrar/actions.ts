'use server';

import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { entrarAdmin } from '@/server/auth';
import { MSG_ALGO_DEU_ERRADO } from '@/server/erros';
import { criarSessaoAdmin } from '@/server/sessao';

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' });

export type EstadoEntrarAdmin = { erro: string | null; usuario: string };

export async function entrarComoAdmin(_anterior: EstadoEntrarAdmin, form: FormData): Promise<EstadoEntrarAdmin> {
  const usuario = String(form.get('usuario') ?? '').trim();
  const senha = String(form.get('senha') ?? '');
  if (!usuario || !senha) return { erro: 'Preencha usuário e senha.', usuario };

  try {
    const r = await entrarAdmin(getDb(), usuario, senha);
    if (!r.ok) {
      return r.motivo === 'bloqueado'
        ? { erro: `Muitas tentativas. Tente de novo às ${HORA.format(r.bloqueadoAte)}.`, usuario }
        : { erro: 'Usuário ou senha errados.', usuario };
    }
    await criarSessaoAdmin(getDb(), r.adminId);
  } catch (e) {
    console.error(e);
    return { erro: MSG_ALGO_DEU_ERRADO, usuario };
  }
  redirect('/admin');
}
