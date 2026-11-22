import { beforeEach, describe, expect, it, vi } from 'vitest';

// A ação `iniciar` confere a sessão e o formato do pedido antes de falar com o banco. Sessão, banco,
// redirect e `iniciarPartida` são trocados por dublês: aqui só importa o que a ação deixa passar.
const iniciarPartida = vi.fn(async () => 42);
vi.mock('@/server/partidas', () => ({ iniciarPartida, quemPodeCompletar: vi.fn() }));
vi.mock('@/server/sessao', () => ({
  lerAcessoPartidas: async () => ({ tipo: 'admin' }),
  acessoNaPelada: (a: { tipo: string } | null) => a?.tipo === 'admin',
  destinoSemAcesso: () => '/admin/entrar',
}));
vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const { iniciar } = await import('@/app/admin/(area)/partidas/acoes');

beforeEach(() => iniciarPartida.mockClear());

describe('iniciar', () => {
  it('recusa `completam` fora do formato sem tocar no banco', async () => {
    for (const ruim of [null, 'x', [], { A: [1] }, { A: [1], B: 'x' }, { A: [0], B: [] }, { A: [1, 2, 3, 4, 5], B: [] }]) {
      // @ts-expect-error de propósito: o cliente pode mandar qualquer coisa
      expect(await iniciar(1, 2, 3, ruim), JSON.stringify(ruim)).toEqual({ ok: false, erro: 'Pedido inválido.' });
    }
    expect(iniciarPartida).not.toHaveBeenCalled();
  });

  it('com o formato certo, inicia com quem completa cada lado e abre o anotador', async () => {
    await expect(iniciar(1, 2, 3, { A: [7], B: [] })).rejects.toThrow('redirect:/admin/partida/42');
    expect(iniciarPartida).toHaveBeenCalledWith({}, 1, 2, 3, expect.any(Date), { A: [7], B: [] }, { A: null, B: null });
  });

  it('sem `completam` (nenhum COMPLETE), inicia com as listas vazias', async () => {
    await expect(iniciar(1, 2, 3)).rejects.toThrow('redirect:/admin/partida/42');
    expect(iniciarPartida).toHaveBeenCalledWith({}, 1, 2, 3, expect.any(Date), { A: [], B: [] }, { A: null, B: null });
  });

  it('passa os goleiros e recusa goleiros fora do formato', async () => {
    await expect(iniciar(1, 2, 3, { A: [], B: [] }, { A: 9, B: null })).rejects.toThrow('redirect:/admin/partida/42');
    expect(iniciarPartida).toHaveBeenCalledWith({}, 1, 2, 3, expect.any(Date), { A: [], B: [] }, { A: 9, B: null });
    iniciarPartida.mockClear();
    for (const ruim of [null, { A: 9, B: 9 }, { A: -1, B: null }, { A: '9', B: null }]) {
      // @ts-expect-error de propósito: o cliente pode mandar qualquer coisa
      expect(await iniciar(1, 2, 3, { A: [], B: [] }, ruim), JSON.stringify(ruim)).toEqual({ ok: false, erro: 'Pedido inválido.' });
    }
    expect(iniciarPartida).not.toHaveBeenCalled();
  });
});
