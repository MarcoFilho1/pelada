import { describe, expect, it, vi } from 'vitest';
import type { EstadoDaSemana } from '@/server/presencas';
import type { EstadoDoRobo } from '@/robo/agenda';
import { umaVolta } from '@/robo/volta';

const t = (s: string) => new Date(`${s}-03:00`);
const lista: EstadoDaSemana = {
  aberta: true,
  cancelada: false,
  principal: [{ jogadorId: 1, nome: 'Ana', tipo: 'M', confirmado: true }],
  fila: [],
  vagas: 16,
  peladaId: 1,
  data: '2026-11-11',
  estadoManual: null,
  foraDoPrazo: [],
};
const vazio: EstadoDoRobo = { ultimo: null, aberturaEnviada: null, grupoId: 'g@g.us' };

function deps(over: Partial<Parameters<typeof umaVolta>[2]> = {}) {
  return {
    lerLista: vi.fn(async () => lista),
    enviar: vi.fn(async () => {}),
    gravar: vi.fn(),
    log: vi.fn(),
    ...over,
  };
}

describe('uma volta do laço', () => {
  it('envio confirmado: grava ultimo (com a rodada) e aberturaEnviada', async () => {
    const d = deps();
    const now = t('2026-11-09T14:00:30');
    const novo = await umaVolta(now, vazio, d);
    expect(d.enviar).toHaveBeenCalledWith(expect.stringContaining('A lista de quarta, 11/11 está aberta.'));
    expect(novo.ultimo).toMatchObject({ tipo: 'abertura', quando: now.toISOString(), rodada: t('2026-11-09T14:00:00').toISOString() });
    expect(novo.aberturaEnviada).toBe('2026-11-11');
    expect(d.gravar).toHaveBeenCalledWith(novo);
  });

  it('envio que falha: não grava nada e devolve o mesmo estado', async () => {
    const d = deps({ enviar: vi.fn(async () => Promise.reject(new Error('sem rede'))) });
    expect(await umaVolta(t('2026-11-09T14:00:30'), vazio, d)).toBe(vazio);
    expect(d.gravar).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining('sem rede'));
  });

  it('erro de banco: não envia nem grava', async () => {
    const d = deps({ lerLista: vi.fn(async () => Promise.reject(new Error('banco fora'))) });
    expect(await umaVolta(t('2026-11-09T14:00:30'), vazio, d)).toBe(vazio);
    expect(d.enviar).not.toHaveBeenCalled();
    expect(d.gravar).not.toHaveBeenCalled();
  });

  it('nada a enviar: não envia nem grava', async () => {
    const d = deps();
    const depois = await umaVolta(t('2026-11-09T14:00:30'), vazio, d);
    const d2 = deps();
    expect(await umaVolta(t('2026-11-09T14:30:10'), depois, d2)).toBe(depois);
    expect(d2.enviar).not.toHaveBeenCalled();
    expect(d2.gravar).not.toHaveBeenCalled();
  });

  it('enviou mas a gravação falhou: segue com o estado novo (não repete a rodada neste processo)', async () => {
    const d = deps({ gravar: vi.fn(() => { throw new Error('disco cheio'); }) });
    const novo = await umaVolta(t('2026-11-09T14:00:30'), vazio, d);
    expect(novo.ultimo?.tipo).toBe('abertura');
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining('ATENÇÃO'));
    const d2 = deps();
    await umaVolta(t('2026-11-09T14:00:50'), novo, d2);
    expect(d2.enviar).not.toHaveBeenCalled();
  });
});
