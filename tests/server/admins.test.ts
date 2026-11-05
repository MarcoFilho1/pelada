import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { admins } from '@/db/schema';
import { semearAdmin } from '@/db/seed';
import { TAM_MIN_SENHA_ADMIN } from '@/domain/admin';
import { criarAdmin, listarAdmins, trocarSenhaAdmin } from '@/server/admins';
import { entrarAdmin, validarSessaoAdmin, versaoSessaoAdmin } from '@/server/auth';
import { createTestDb } from '../helpers/db';

const now = new Date('2026-11-04T12:00:00-03:00');
const minutos = (m: number) => new Date(now.getTime() + m * 60_000);
const SENHA = 'senha-forte-123';

let db: DB;

beforeEach(async () => {
  db = await createTestDb();
});

async function lerAdmin(id: number) {
  const [a] = await db.select().from(admins).where(eq(admins.id, id));
  return a;
}

describe('senha mínima', () => {
  it('é 10 e vale no seed, na criação e na troca', async () => {
    expect(TAM_MIN_SENHA_ADMIN).toBe(10);
    const curta = 'a'.repeat(9);
    await expect(semearAdmin(db, { ADMIN_USUARIO: 'marco', ADMIN_SENHA: curta })).rejects.toThrow(/10/);
    expect(await db.select().from(admins)).toHaveLength(0);
    await expect(criarAdmin(db, 'marco', curta)).rejects.toThrow(/10/);
    expect(await semearAdmin(db, { ADMIN_USUARIO: 'marco', ADMIN_SENHA: 'a'.repeat(10) })).toBe('criado');
    const [m] = await db.select().from(admins);
    await expect(trocarSenhaAdmin(db, m.id, 'a'.repeat(10), curta)).rejects.toThrow(/10/);
  });
});

describe('criarAdmin e listarAdmins', () => {
  it('cria, entra com a senha e lista só o usuário', async () => {
    const adm = await criarAdmin(db, '  ana  ', SENHA);
    expect(adm.usuario).toBe('ana');
    expect((await entrarAdmin(db, 'ana', SENHA, now)).ok).toBe(true);
    const lista = await listarAdmins(db);
    expect(lista).toEqual([{ id: adm.id, usuario: 'ana' }]);
  });

  it('recusa usuário vazio ou repetido', async () => {
    await expect(criarAdmin(db, '   ', SENHA)).rejects.toThrow();
    await criarAdmin(db, 'ana', SENHA);
    await expect(criarAdmin(db, 'ana', SENHA)).rejects.toThrow(/já existe/i);
  });
});

describe('trocarSenhaAdmin', () => {
  it('confere a senha atual, troca e derruba o token antigo', async () => {
    const adm = await criarAdmin(db, 'ana', SENHA);
    const versaoAntes = (await versaoSessaoAdmin(db, adm.id))!;
    const tokenAntigo = { tipo: 'admin' as const, adminId: adm.id, versao: versaoAntes };
    expect(await validarSessaoAdmin(db, tokenAntigo)).toEqual({ adminId: adm.id });

    await expect(trocarSenhaAdmin(db, adm.id, 'errada-errada', 'nova-senha-123')).rejects.toThrow(/atual/i);
    expect(await validarSessaoAdmin(db, tokenAntigo)).not.toBeNull();

    await trocarSenhaAdmin(db, adm.id, SENHA, 'nova-senha-123');
    expect(await validarSessaoAdmin(db, tokenAntigo)).toBeNull();
    expect(await versaoSessaoAdmin(db, adm.id)).toBe(versaoAntes + 1);
    expect(await validarSessaoAdmin(db, { ...tokenAntigo, versao: versaoAntes + 1 })).toEqual({ adminId: adm.id });
    expect((await entrarAdmin(db, 'ana', SENHA, now)).ok).toBe(false);
    expect((await entrarAdmin(db, 'ana', 'nova-senha-123', now)).ok).toBe(true);
  });

  it('admin inexistente dá erro', async () => {
    await expect(trocarSenhaAdmin(db, 9999, SENHA, 'nova-senha-123')).rejects.toThrow();
  });
});

describe('validarSessaoAdmin', () => {
  it('recusa admin inexistente e versão diferente', async () => {
    const adm = await criarAdmin(db, 'ana', SENHA);
    expect(await validarSessaoAdmin(db, { tipo: 'admin', adminId: 9999, versao: 0 })).toBeNull();
    expect(await validarSessaoAdmin(db, { tipo: 'admin', adminId: adm.id, versao: 7 })).toBeNull();
    expect(await validarSessaoAdmin(db, { tipo: 'admin', adminId: adm.id, versao: 0 })).toEqual({ adminId: adm.id });
  });
});

describe('entrarAdmin: bloqueio', () => {
  it('5 erros bloqueiam por 15 min, mesmo com a senha certa; depois libera', async () => {
    const adm = await criarAdmin(db, 'ana', SENHA);
    for (let i = 0; i < 4; i++) {
      expect(await entrarAdmin(db, 'ana', 'errada-errada', now)).toEqual({ ok: false, motivo: 'credenciais' });
    }
    const ate = minutos(15);
    expect(await entrarAdmin(db, 'ana', 'errada-errada', now)).toEqual({ ok: false, motivo: 'bloqueado', bloqueadoAte: ate });
    expect(await entrarAdmin(db, 'ana', SENHA, minutos(1))).toEqual({ ok: false, motivo: 'bloqueado', bloqueadoAte: ate });
    expect(await entrarAdmin(db, 'ana', SENHA, minutos(15))).toEqual({ ok: true, adminId: adm.id });
    const a = await lerAdmin(adm.id);
    expect(a.erros).toBe(0);
    expect(a.bloqueadoAte).toBeNull();
  });

  it('acerto zera a contagem; usuário desconhecido responde como senha errada', async () => {
    const adm = await criarAdmin(db, 'ana', SENHA);
    await entrarAdmin(db, 'ana', 'errada-errada', now);
    expect((await lerAdmin(adm.id)).erros).toBe(1);
    await entrarAdmin(db, 'ana', SENHA, now);
    expect((await lerAdmin(adm.id)).erros).toBe(0);
    expect(await entrarAdmin(db, 'fantasma', SENHA, now)).toEqual({ ok: false, motivo: 'credenciais' });
  });
});
