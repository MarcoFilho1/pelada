import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { adicionarDupla, listarDuplas, paresSeparados, removerDupla } from '@/server/duplas';
import { criarJogadores } from '@/server/jogadores';
import { createTestDb } from '../helpers/db';

let db: DB;
let ids: Record<string, number>;

beforeEach(async () => {
  db = await createTestDb();
  const { criados } = await criarJogadores(db, ['Luiz', 'Jonas', 'Ana']);
  ids = Object.fromEntries(criados.map((c) => [c.nome, c.id]));
});

describe('duplas separadas', () => {
  it('adiciona em qualquer ordem, lista com nomes em ordem alfabética e devolve os pares', async () => {
    await adicionarDupla(db, ids.Luiz, ids.Jonas);
    expect(await listarDuplas(db)).toEqual([{ id: expect.any(Number), a: { id: ids.Jonas, nome: 'Jonas' }, b: { id: ids.Luiz, nome: 'Luiz' } }]);
    const [[a, b]] = await paresSeparados(db);
    expect(new Set([a, b])).toEqual(new Set([ids.Luiz, ids.Jonas]));
  });

  it('a mesma dupla ao contrário, a mesma pessoa duas vezes ou jogador inexistente: recusa', async () => {
    await adicionarDupla(db, ids.Luiz, ids.Jonas);
    await expect(adicionarDupla(db, ids.Jonas, ids.Luiz)).rejects.toThrow('Essa dupla já está separada.');
    await expect(adicionarDupla(db, ids.Ana, ids.Ana)).rejects.toThrow('Escolha duas pessoas diferentes.');
    await expect(adicionarDupla(db, ids.Ana, 9999)).rejects.toThrow('Jogador não encontrado');
    expect(await listarDuplas(db)).toHaveLength(1);
  });

  it('remover tira a dupla', async () => {
    await adicionarDupla(db, ids.Luiz, ids.Jonas);
    const [d] = await listarDuplas(db);
    await removerDupla(db, d.id);
    expect(await listarDuplas(db)).toEqual([]);
  });
});
