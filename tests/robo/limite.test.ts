import { describe, expect, it, vi } from 'vitest';
import { ErroDeLimite, comEsperaDoLimite } from '@/robo/limite';

const semEsperar = async () => {};

describe('aviso que espera o limite de envio', () => {
  it('recusado pelo limite da hora: espera o que o limite pede e manda (25/11: os times não chegaram aos organizadores)', async () => {
    const enviar = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new ErroDeLimite('hora', 'hora', 256_000)).mockRejectedValueOnce(new ErroDeLimite('hora', 'hora', 10_000)).mockResolvedValue('foi');
    const esperas: number[] = [];
    expect(await comEsperaDoLimite(enviar, { dormir: async (ms) => void esperas.push(ms) })).toBe('foi');
    expect(enviar).toHaveBeenCalledTimes(3);
    expect(esperas).toEqual([258_000, 12_000]);
  });

  it('avisa quem chama a cada espera, para o registro', async () => {
    const enviar = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new ErroDeLimite('minuto', 'minuto', 1_000)).mockResolvedValue();
    const aoEsperar = vi.fn();
    await comEsperaDoLimite(enviar, { dormir: semEsperar, aoEsperar });
    expect(aoEsperar).toHaveBeenCalledWith('minuto', 5_000);
  });

  it('desiste quando a espera passa do máximo, com o erro do limite', async () => {
    const enviar = vi.fn<() => Promise<void>>().mockRejectedValue(new ErroDeLimite('hora', 'hora', 20 * 60_000));
    await expect(comEsperaDoLimite(enviar, { dormir: semEsperar, maximoMs: 30 * 60_000 })).rejects.toBeInstanceOf(ErroDeLimite);
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it('limite do dia e outros erros sobem na hora, sem tentar de novo', async () => {
    const doDia = vi.fn<() => Promise<void>>().mockRejectedValue(new ErroDeLimite('dia', 'dia', 1_000));
    await expect(comEsperaDoLimite(doDia, { dormir: semEsperar })).rejects.toBeInstanceOf(ErroDeLimite);
    expect(doDia).toHaveBeenCalledTimes(1);
    const outro = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('sem conexão'));
    await expect(comEsperaDoLimite(outro, { dormir: semEsperar })).rejects.toThrow('sem conexão');
    expect(outro).toHaveBeenCalledTimes(1);
  });
});
