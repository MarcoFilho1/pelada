import { describe, expect, it } from 'vitest';
import { jogadores } from '@/db/schema';
import { createTestDb } from '../helpers/db';

describe('schema', () => {
  it('aplica os padrões ao criar jogador só com nome', async () => {
    const db = await createTestDb();
    await db.insert(jogadores).values({ nome: 'Pepe' });
    const [j] = await db.select().from(jogadores);
    expect(j.nota).toBe('3.0');
    expect(j.pinPrecisaTrocar).toBe(true);
    expect(j.ativo).toBe(true);
    expect(j.pinErros).toBe(0);
    expect(j.bloqueadoAte).toBeNull();
  });

  it('rejeita nome repetido sem diferenciar maiúsculas', async () => {
    const db = await createTestDb();
    await db.insert(jogadores).values({ nome: 'Pepe' });
    await expect(db.insert(jogadores).values({ nome: 'pepe' })).rejects.toMatchObject({
      cause: { code: '23505', constraint: 'jogadores_nome_lower_uniq' },
    });
  });
});
