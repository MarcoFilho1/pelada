import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { admins, jogadores } from '@/db/schema';
import {
  buscarJogadoresPorNome,
  entrarAdmin,
  entrarJogador,
  trocarPin,
  trocarPinComAtual,
} from '@/server/auth';
import { hashSegredo } from '@/server/senha';
import { createTestDb } from '../helpers/db';

const now = new Date('2026-11-04T12:00:00-03:00');
const minutos = (m: number) => new Date(now.getTime() + m * 60_000);

let db: DB;

async function criarJogador(nome: string, extra: Partial<typeof jogadores.$inferInsert> = {}) {
  const [j] = await db.insert(jogadores).values({ nome, ...extra }).returning();
  return j;
}

async function lerJogador(id: number) {
  const [j] = await db.select().from(jogadores).where(eq(jogadores.id, id));
  return j;
}

beforeEach(async () => {
  db = await createTestDb();
});

describe('entrarJogador', () => {
  it('jogador novo entra com 1234 e precisa trocar', async () => {
    const caio = await criarJogador('Caio');
    expect(await entrarJogador(db, caio.id, '1234', now)).toEqual({ ok: true, precisaTrocar: true });
  });

  it('PIN errado conta erro; acerto zera a contagem', async () => {
    const caio = await criarJogador('Caio');
    expect(await entrarJogador(db, caio.id, '0000', now)).toEqual({ ok: false, motivo: 'pin_errado' });
    expect((await lerJogador(caio.id)).pinErros).toBe(1);
    await entrarJogador(db, caio.id, '1234', now);
    expect((await lerJogador(caio.id)).pinErros).toBe(0);
  });

  it('5 PINs errados bloqueiam; o 6º com o PIN certo dá bloqueado', async () => {
    const caio = await criarJogador('Caio');
    for (let i = 0; i < 4; i++) {
      expect(await entrarJogador(db, caio.id, '0000', now)).toEqual({ ok: false, motivo: 'pin_errado' });
    }
    const ate = minutos(15);
    expect(await entrarJogador(db, caio.id, '0000', now)).toEqual({ ok: false, motivo: 'bloqueado', bloqueadoAte: ate });
    expect(await entrarJogador(db, caio.id, '1234', minutos(1))).toEqual({ ok: false, motivo: 'bloqueado', bloqueadoAte: ate });
  });

  it('bloqueado não confere o PIN nem conta erro', async () => {
    const caio = await criarJogador('Caio', { bloqueadoAte: minutos(10), pinErros: 0 });
    expect(await entrarJogador(db, caio.id, '0000', now)).toEqual({
      ok: false,
      motivo: 'bloqueado',
      bloqueadoAte: minutos(10),
    });
    expect((await lerJogador(caio.id)).pinErros).toBe(0);
    expect((await lerJogador(caio.id)).bloqueadoAte).toEqual(minutos(10));
  });

  it('depois de 15 minutos o bloqueio acaba', async () => {
    const caio = await criarJogador('Caio');
    for (let i = 0; i < 5; i++) await entrarJogador(db, caio.id, '0000', now);
    expect(await entrarJogador(db, caio.id, '1234', minutos(15))).toEqual({ ok: true, precisaTrocar: true });
    expect((await lerJogador(caio.id)).bloqueadoAte).toBeNull();
  });

  it('jogador inativo ou inexistente não entra', async () => {
    const zeca = await criarJogador('Zeca', { ativo: false });
    expect(await entrarJogador(db, zeca.id, '1234', now)).toEqual({ ok: false, motivo: 'pin_errado' });
    expect(await entrarJogador(db, 9999, '1234', now)).toEqual({ ok: false, motivo: 'pin_errado' });
  });
});

describe('trocarPin', () => {
  it('recusa 1234 e PIN inválido', async () => {
    const caio = await criarJogador('Caio');
    await expect(trocarPin(db, caio.id, '1234')).rejects.toThrow();
    await expect(trocarPin(db, caio.id, '12a4')).rejects.toThrow();
    await expect(trocarPin(db, caio.id, '12345')).rejects.toThrow();
  });

  it('com PIN novo, entra sem precisar trocar e o PIN antigo para de valer', async () => {
    const caio = await criarJogador('Caio');
    await trocarPin(db, caio.id, '7788');
    expect(await entrarJogador(db, caio.id, '7788', now)).toEqual({ ok: true, precisaTrocar: false });
    expect(await entrarJogador(db, caio.id, '1234', now)).toEqual({ ok: false, motivo: 'pin_errado' });
    expect((await lerJogador(caio.id)).pinHash).not.toContain('7788');
  });

  it('lança erro para jogador inexistente', async () => {
    await expect(trocarPin(db, 9999, '7788')).rejects.toThrow();
  });
});

describe('trocarPinComAtual', () => {
  async function comPin(nome: string, pin: string, extra: Partial<typeof jogadores.$inferInsert> = {}) {
    return criarJogador(nome, { pinHash: await hashSegredo(pin), pinPrecisaTrocar: false, ...extra });
  }

  it('com o PIN atual certo grava o novo, zera erros e derruba as outras sessões', async () => {
    const caio = await comPin('Caio', '4321', { pinErros: 3 });
    expect(await trocarPinComAtual(db, caio.id, '4321', '5678', now)).toEqual({ ok: true });
    const depois = await lerJogador(caio.id);
    expect(depois.sessaoVersao).toBe(caio.sessaoVersao + 1);
    expect(depois.pinErros).toBe(0);
    expect(await entrarJogador(db, caio.id, '5678', now)).toEqual({ ok: true, precisaTrocar: false });
    expect(await entrarJogador(db, caio.id, '4321', now)).toEqual({ ok: false, motivo: 'pin_errado' });
  });

  it('PIN atual errado não troca, conta erro e não mexe na sessão', async () => {
    const caio = await comPin('Caio', '4321');
    expect(await trocarPinComAtual(db, caio.id, '0000', '5678', now)).toEqual({ ok: false, motivo: 'pin_errado' });
    const depois = await lerJogador(caio.id);
    expect(depois.pinErros).toBe(1);
    expect(depois.sessaoVersao).toBe(caio.sessaoVersao);
    expect(depois.pinHash).toBe(caio.pinHash);
  });

  it('erros na troca e na entrada somam para o mesmo bloqueio de 15 min', async () => {
    const caio = await comPin('Caio', '4321');
    for (let i = 0; i < 2; i++) await entrarJogador(db, caio.id, '0000', now);
    for (let i = 0; i < 2; i++) {
      expect(await trocarPinComAtual(db, caio.id, '0000', '5678', now)).toEqual({ ok: false, motivo: 'pin_errado' });
    }
    const ate = minutos(15);
    expect(await trocarPinComAtual(db, caio.id, '0000', '5678', now)).toEqual({ ok: false, motivo: 'bloqueado', bloqueadoAte: ate });
    expect(await entrarJogador(db, caio.id, '4321', minutos(1))).toEqual({ ok: false, motivo: 'bloqueado', bloqueadoAte: ate });
  });

  it('bloqueado responde bloqueado mesmo com o PIN certo e não troca', async () => {
    const ate = minutos(10);
    const caio = await comPin('Caio', '4321', { bloqueadoAte: ate });
    expect(await trocarPinComAtual(db, caio.id, '4321', '5678', now)).toEqual({ ok: false, motivo: 'bloqueado', bloqueadoAte: ate });
    expect((await lerJogador(caio.id)).pinHash).toBe(caio.pinHash);
    expect(await trocarPinComAtual(db, caio.id, '4321', '5678', minutos(11))).toEqual({ ok: true });
  });

  it('PIN novo inválido (1234, letras, curto) é recusado sem conferir nem contar erro', async () => {
    const caio = await comPin('Caio', '4321');
    for (const novo of ['1234', 'abcd', '123']) {
      expect(await trocarPinComAtual(db, caio.id, '0000', novo, now)).toEqual({ ok: false, motivo: 'pin_invalido' });
    }
    expect((await lerJogador(caio.id)).pinErros).toBe(0);
  });

  it('jogador inativo ou inexistente não troca', async () => {
    const caio = await comPin('Caio', '4321', { ativo: false });
    expect(await trocarPinComAtual(db, caio.id, '4321', '5678', now)).toEqual({ ok: false, motivo: 'pin_errado' });
    expect(await trocarPinComAtual(db, 9999, '4321', '5678', now)).toEqual({ ok: false, motivo: 'pin_errado' });
  });
});

describe('buscarJogadoresPorNome', () => {
  it('acha por parte do nome, sem diferenciar maiúsculas, só ativos', async () => {
    const caio = await criarJogador('Caio');
    await criarJogador('Lucas');
    await criarJogador('Carlos', { ativo: false });
    await criarJogador('Pepe');
    const achados = await buscarJogadoresPorNome(db, 'ca');
    expect(achados).toEqual([
      { id: caio.id, nome: 'Caio' },
      { id: expect.any(Number), nome: 'Lucas' },
    ]);
  });

  it('ignora acentos e maiúsculas nos dois sentidos', async () => {
    await criarJogador('João');
    await criarJogador('Lucas');
    await criarJogador('Ana João');
    expect((await buscarJogadoresPorNome(db, 'joao')).map((j) => j.nome)).toEqual(['João', 'Ana João']);
    expect((await buscarJogadoresPorNome(db, 'JOAO')).map((j) => j.nome)).toEqual(['João', 'Ana João']);
    await criarJogador('Antônio');
    expect((await buscarJogadoresPorNome(db, 'antonio')).map((j) => j.nome)).toEqual(['Antônio']);
    expect((await buscarJogadoresPorNome(db, 'ANTÔ')).map((j) => j.nome)).toEqual(['Antônio']);
  });

  it('devolve no máximo 8 e nada para termo vazio', async () => {
    for (let i = 1; i <= 10; i++) await criarJogador(`Jogador ${i}`);
    expect(await buscarJogadoresPorNome(db, 'jog')).toHaveLength(8);
    expect(await buscarJogadoresPorNome(db, '   ')).toEqual([]);
  });

  it('trata % e _ como texto, não como curinga', async () => {
    await criarJogador('Caio');
    expect(await buscarJogadoresPorNome(db, '%')).toEqual([]);
    expect(await buscarJogadoresPorNome(db, 'C_io')).toEqual([]);
  });
});

describe('entrarAdmin', () => {
  it('entra com a senha certa e recusa a errada ou usuário desconhecido', async () => {
    const [adm] = await db
      .insert(admins)
      .values({ usuario: 'marco', senhaHash: await hashSegredo('segredo-forte') })
      .returning();
    expect(await entrarAdmin(db, 'marco', 'segredo-forte')).toEqual({ ok: true, adminId: adm.id });
    expect(await entrarAdmin(db, 'marco', 'errada')).toEqual({ ok: false, motivo: 'credenciais' });
    expect(await entrarAdmin(db, 'outro', 'segredo-forte')).toEqual({ ok: false, motivo: 'credenciais' });
  });
});
