import { describe, expect, it } from 'vitest';
import { admins } from '@/db/schema';
import { semearAdmin } from '@/db/seed';
import { entrarAdmin } from '@/server/auth';
import { createTestDb } from '../helpers/db';

describe('semearAdmin', () => {
  it('recusa rodar sem usuário ou senha', async () => {
    const db = await createTestDb();
    await expect(semearAdmin(db, { ADMIN_USUARIO: 'marco' })).rejects.toThrow(/ADMIN_SENHA/);
    await expect(semearAdmin(db, { ADMIN_SENHA: 'x' })).rejects.toThrow(/ADMIN_USUARIO/);
    expect(await db.select().from(admins)).toHaveLength(0);
  });

  it('cria o primeiro admin e não faz nada se já existe um', async () => {
    const db = await createTestDb();
    expect(await semearAdmin(db, { ADMIN_USUARIO: 'marco', ADMIN_SENHA: 'segredo' })).toBe('criado');
    expect(await semearAdmin(db, { ADMIN_USUARIO: 'outro', ADMIN_SENHA: 'x' })).toBe('ja_existe');
    expect(await db.select().from(admins)).toHaveLength(1);
    expect((await entrarAdmin(db, 'marco', 'segredo')).ok).toBe(true);
  });
});
