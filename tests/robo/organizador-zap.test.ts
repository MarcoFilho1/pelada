import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { atualizarJogador, criarJogadores, listarJogadores } from '@/server/jogadores';
import { mudarNota, textoDasNotas, textoDoSite, urlDoSite } from '@/robo/organizador-zap';
import { createTestDb } from '../helpers/db';

let db: DB;

beforeEach(async () => {
  db = await createTestDb();
});

describe('textoDasNotas', () => {
  it('ativos em ordem alfabética com a nota; inativo fica de fora', async () => {
    const { criados } = await criarJogadores(db, ['Bia', 'Ana', 'Velho']);
    await atualizarJogador(db, criados[0].id, { nota: 2.5 });
    await atualizarJogador(db, criados[2].id, { ativo: false });
    expect(await textoDasNotas(db)).toBe('📋 Notas (2 jogadores):\nAna 3,0\nBia 2,5');
  });

  it('sem jogadores', async () => {
    expect(await textoDasNotas(db)).toBe('📋 Nenhum jogador ativo cadastrado.');
  });
});

describe('mudarNota', () => {
  beforeEach(async () => {
    await criarJogadores(db, ['Ana Paula', 'Pepe', 'Pedro']);
  });

  it('muda pelo nome (sem acento e pelo começo) e grava', async () => {
    expect(await mudarNota(db, 'ana', 3.5)).toEqual({ texto: '✅ Nota de Ana Paula: 3,0 → 3,5.', mudou: true });
    const ana = (await listarJogadores(db, { incluirInativos: false })).find((j) => j.nome === 'Ana Paula');
    expect(ana?.nota).toBe(3.5);
  });

  it('mesma nota, nota inválida, ambíguo, sugestão e não achado', async () => {
    expect(await mudarNota(db, 'Pepe', 3)).toEqual({ texto: '👍 Pepe já está com nota 3,0.', mudou: false });
    expect(await mudarNota(db, 'Pepe', 2.3)).toEqual({ texto: '⚠️ Nota inválida: 2,3. Use de 0 a 5, de 0,5 em 0,5.', mudou: false });
    expect((await mudarNota(db, 'Pe', 4)).texto).toBe('🤔 Tem mais de um jogador com esse nome: Pedro e Pepe. Mande o nome inteiro.');
    expect((await mudarNota(db, 'Pepi', 4)).texto).toBe('🤔 Não achei "Pepi". Você quis dizer Pepe?');
    expect((await mudarNota(db, 'Zzzzzz', 4)).texto).toBe('🤔 Zzzzzz não está cadastrado.');
  });
});

describe('site', () => {
  it('ROBO_URL_SITE sem a barra do fim; sem ele, o site no ar', () => {
    expect(urlDoSite({ ROBO_URL_SITE: 'https://x.dev/' })).toBe('https://x.dev');
    expect(urlDoSite({})).toBe('https://pelada-black.vercel.app');
    expect(textoDoSite('https://x.dev')).toBe('🌐 Site da pelada: https://x.dev\n🔐 Área dos organizadores: https://x.dev/admin');
  });
});
