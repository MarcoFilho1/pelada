import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalvadorDeNotas, type ResultadoSalvar } from '../../src/app/admin/(area)/jogadores/salvar-notas';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function montar(resposta: () => Promise<ResultadoSalvar> = async () => ({ ok: true })) {
  const salvar = vi.fn<(id: number, nota: number) => Promise<ResultadoSalvar>>(async () => resposta());
  const terminou = vi.fn();
  return { salvar, terminou, s: new SalvadorDeNotas(salvar, terminou, 500) };
}

describe('SalvadorDeNotas', () => {
  it('toques seguidos viram um pedido só, depois da espera', async () => {
    const { s, salvar } = montar();
    s.agendar(1, 3.5);
    s.agendar(1, 4);
    await vi.advanceTimersByTimeAsync(499);
    expect(salvar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(salvar).toHaveBeenCalledExactlyOnceWith(1, 4);
  });

  it('descarregar manda na hora o que espera (sair da tela dentro dos 500 ms)', async () => {
    const { s, salvar } = montar();
    s.agendar(1, 4.5);
    s.agendar(2, 1);
    s.descarregar();
    await vi.advanceTimersByTimeAsync(0);
    expect(salvar).toHaveBeenCalledTimes(2);
    expect(salvar).toHaveBeenCalledWith(1, 4.5);
    await vi.advanceTimersByTimeAsync(1000);
    expect(salvar).toHaveBeenCalledTimes(2); // o timer antigo não manda de novo
  });

  it('ocupado vale do toque até o fim do pedido, inclusive com um segundo toque no meio', async () => {
    let liberar!: () => void;
    const { s, terminou } = montar(() => new Promise((r) => (liberar = () => r({ ok: true }))));
    s.agendar(1, 4);
    expect(s.ocupado(1)).toBe(true);
    await vi.advanceTimersByTimeAsync(500); // pedido 1 a caminho
    s.agendar(1, 4.5); // segundo toque enquanto o primeiro não voltou
    liberar();
    await vi.advanceTimersByTimeAsync(0);
    expect(terminou).toHaveBeenCalledTimes(1);
    expect(s.ocupado(1)).toBe(true); // o segundo ainda espera: não pode soltar a nota local
    await vi.advanceTimersByTimeAsync(500);
    liberar();
    await vi.advanceTimersByTimeAsync(0);
    expect(terminou).toHaveBeenCalledTimes(2);
    expect(s.ocupado(1)).toBe(false);
  });

  it('pedidos do mesmo jogador seguem em fila, na ordem', async () => {
    const ordem: number[] = [];
    const { s } = montar();
    const salvar = vi.fn(async (id: number, nota: number) => {
      void id;
      ordem.push(nota);
      await new Promise((r) => setTimeout(r, 100));
      return { ok: true } as const;
    });
    const t = new SalvadorDeNotas(salvar, () => {}, 500);
    t.agendar(1, 4);
    await vi.advanceTimersByTimeAsync(500);
    t.agendar(1, 4.5);
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(300);
    expect(ordem).toEqual([4, 4.5]);
    expect(s.ocupado(1)).toBe(false);
  });

  it('falha do servidor ou exceção chega em aoTerminar como erro', async () => {
    const { s, terminou } = montar(async () => {
      throw new Error('rede');
    });
    s.agendar(1, 2);
    await vi.advanceTimersByTimeAsync(500);
    expect(terminou).toHaveBeenCalledWith(1, { ok: false, erro: expect.any(String) });
    expect(s.ocupado(1)).toBe(false);
  });
});
