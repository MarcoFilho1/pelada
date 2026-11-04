import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { admins, jogadores } from '@/db/schema';
import {
  dadosSessaoJogador,
  revogarSessoesJogador,
  trocarPin,
  validarSessaoAdmin,
  validarSessaoJogador,
} from '@/server/auth';
import type { TokenJogador } from '@/server/token';
import { createTestDb } from '../helpers/db';

let db: DB;
let caioId: number;

async function tokenAtual(jogadorId: number): Promise<TokenJogador> {
  const d = await dadosSessaoJogador(db, jogadorId);
  if (!d) throw new Error('sem dados de sessão');
  return { tipo: 'jogador', jogadorId, precisaTrocar: d.precisaTrocar, versao: d.versao };
}

beforeEach(async () => {
  db = await createTestDb();
  const [caio] = await db.insert(jogadores).values({ nome: 'Caio' }).returning();
  caioId = caio.id;
});

describe('sessão do jogador conferida no banco', () => {
  it('token da versão atual vale', async () => {
    await trocarPin(db, caioId, '7788');
    const t = await tokenAtual(caioId);
    expect(t.versao).toBe(0);
    expect(await validarSessaoJogador(db, t)).toEqual({ jogadorId: caioId, precisaTrocar: false });
  });

  it('trocar o PIN não derruba a sessão do aparelho', async () => {
    const antes = await tokenAtual(caioId);
    await trocarPin(db, caioId, '7788');
    expect(await validarSessaoJogador(db, antes)).not.toBeNull();
  });

  it('depois de revogar, o token antigo é recusado e o novo vale', async () => {
    const antigo = await tokenAtual(caioId);
    await revogarSessoesJogador(db, caioId);
    expect(await validarSessaoJogador(db, antigo)).toBeNull();
    const novo = await tokenAtual(caioId);
    expect(novo.versao).toBe(1);
    expect(await validarSessaoJogador(db, novo)).not.toBeNull();
  });

  it('jogador inativo ou inexistente não tem sessão', async () => {
    const t = await tokenAtual(caioId);
    await db.update(jogadores).set({ ativo: false }).where(eq(jogadores.id, caioId));
    expect(await validarSessaoJogador(db, t)).toBeNull();
    expect(await dadosSessaoJogador(db, caioId)).toBeNull();
    expect(await validarSessaoJogador(db, { ...t, jogadorId: 9999 })).toBeNull();
  });

  it('precisaTrocar vem do banco, não do token', async () => {
    await trocarPin(db, caioId, '7788');
    const t = await tokenAtual(caioId);
    expect(t.precisaTrocar).toBe(false);
    await db.update(jogadores).set({ pinPrecisaTrocar: true }).where(eq(jogadores.id, caioId));
    expect(await validarSessaoJogador(db, t)).toEqual({ jogadorId: caioId, precisaTrocar: true });
  });

  it('revogar jogador inexistente lança erro', async () => {
    await expect(revogarSessoesJogador(db, 9999)).rejects.toThrow();
  });
});

describe('sessão admin conferida no banco', () => {
  it('vale para admin existente e não para id desconhecido', async () => {
    const [adm] = await db.insert(admins).values({ usuario: 'marco', senhaHash: 'x:y' }).returning();
    expect(await validarSessaoAdmin(db, { tipo: 'admin', adminId: adm.id })).toEqual({ adminId: adm.id });
    expect(await validarSessaoAdmin(db, { tipo: 'admin', adminId: 9999 })).toBeNull();
  });
});
