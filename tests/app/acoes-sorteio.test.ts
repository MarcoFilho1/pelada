import { beforeEach, describe, expect, it, vi } from 'vitest';

// A ação `sortear` não grava nada: confere a sessão, o pedido e sorteia com quem está ativo. Sessão,
// banco e a lista de jogadores são dublês; aqui só importa quantos times saem.
const ativos = Array.from({ length: 16 }, (_, i) => ({ id: i + 1, nome: `J${i + 1}`, nota: [5, 4, 3.5, 3, 2.5, 2][i % 6], ativo: true }));
const listarJogadores = vi.fn(async () => ativos);
vi.mock('@/server/jogadores', () => ({ listarJogadores, criarJogadores: vi.fn(), notaValida: () => true }));
vi.mock('@/server/times', () => ({}));
vi.mock('@/server/sessao', () => ({ lerSessaoAdmin: async () => ({ adminId: 1 }) }));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const { sortear } = await import('@/app/admin/(area)/sorteio/acoes');
const ids = (n: number) => ativos.slice(0, n).map((j) => j.id);
const tamanhos = (r: Awaited<ReturnType<typeof sortear>>) => {
  if (!r.ok) throw new Error(r.erro);
  return r.times.map((t) => [t.jogadores.length, t.completes.length]);
};

beforeEach(() => listarJogadores.mockClear());

describe('sortear em 3 ou 4 times', () => {
  it('sem dizer quantos: 4 times (o padrão de sempre)', async () => {
    expect(tamanhos(await sortear(ids(16)))).toHaveLength(4);
  });

  it('3 times: 13 viram 5, 4, 4; 11 ganham 1 COMPLETE', async () => {
    const treze = tamanhos(await sortear(ids(13), 3));
    expect(treze.map(([j]) => j).sort().reverse()).toEqual([5, 4, 4]);
    const onze = tamanhos(await sortear(ids(11), 3));
    expect(onze).toHaveLength(3);
    expect(onze.reduce((s, [, c]) => s + c, 0)).toBe(1);
  });

  it('qualquer outra quantidade vira 4', async () => {
    for (const ruim of [2, 5, 0, '3', null, 3.5]) {
      // @ts-expect-error de propósito: o cliente pode mandar qualquer coisa
      expect(tamanhos(await sortear(ids(16), ruim)), String(ruim)).toHaveLength(4);
    }
  });
});
