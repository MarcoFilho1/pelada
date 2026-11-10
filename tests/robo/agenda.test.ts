import { describe, expect, it } from 'vitest';
import type { ItemLista } from '@/domain/lista';
import type { EstadoDaSemana } from '@/server/presencas';
import { fotografar, type FotoDaLista } from '@/robo/foto';
import { decidir, rodadaDe, type EstadoDoRobo } from '@/robo/agenda';
import { montarMensagem } from '@/robo/mensagem';

const QUARTA = '2026-11-11';
const t = (s: string) => new Date(`${s}-03:00`);
const item = (jogadorId: number, nome: string, confirmado = false, tipo: 'M' | 'D' = 'M'): ItemLista => ({ jogadorId, nome, tipo, confirmado });

function estado(p: Partial<Pick<EstadoDaSemana, 'principal' | 'fila' | 'foraDoPrazo' | 'estadoManual'>> & { data?: string } = {}): EstadoDaSemana {
  return {
    aberta: true,
    cancelada: p.estadoManual === 'cancelada',
    principal: p.principal ?? [],
    fila: p.fila ?? [],
    vagas: 16,
    peladaId: 1,
    data: p.data ?? QUARTA,
    estadoManual: p.estadoManual ?? null,
    foraDoPrazo: p.foraDoPrazo ?? [],
  };
}
const foto = (p: Parameters<typeof estado>[0] = {}) => fotografar(estado(p));
const semMudanca = foto({ principal: [item(1, 'Ana', true), item(2, 'Bia', true)] });
const comMudanca = foto({ principal: [item(1, 'Ana', true), item(2, 'Bia', true), item(3, 'Caio', true)] });
const envio = (quando: string, rodada: string, f: FotoDaLista, tipo: 'rodada' | 'abertura' = 'rodada') => ({ quando: t(quando).toISOString(), rodada: t(rodada).toISOString(), tipo, foto: f });
const robo = (ultimo: EstadoDoRobo['ultimo'] = null, aberturaEnviada: string | null = QUARTA): EstadoDoRobo => ({ ultimo, aberturaEnviada, grupoId: 'g' });

describe('rodadaDe', () => {
  it('arredonda para baixo ao :00/:30', () => {
    expect(rodadaDe(t('2026-11-10T14:37:20')).toISOString()).toBe(t('2026-11-10T14:30:00').toISOString());
    expect(rodadaDe(t('2026-11-10T14:29:59')).toISOString()).toBe(t('2026-11-10T14:00:00').toISOString());
  });
});

describe('decidir', () => {
  it('antes de segunda 14:00 não envia; às 14:00 abre', () => {
    expect(decidir(t('2026-11-09T13:59:00'), semMudanca, robo(null, null))).toBeNull();
    expect(decidir(t('2026-11-09T14:00:00'), semMudanca, robo(null, null))).toBe('abertura');
    expect(decidir(t('2026-11-09T16:10:00'), semMudanca, robo(null, null))).toBe('abertura');
  });
  it('terça sem abertura e sem último: primeira', () => {
    expect(decidir(t('2026-11-10T09:00:00'), semMudanca, robo(null, null))).toBe('primeira');
  });
  it('depois do jogo não envia', () => {
    expect(decidir(t('2026-11-11T20:30:00'), comMudanca, robo(envio('2026-11-11T20:00:00', '2026-11-11T20:00:00', semMudanca)))).toBeNull();
  });
  it('silêncio 23h-8h', () => {
    const u = envio('2026-11-09T22:00:00', '2026-11-09T22:00:00', semMudanca);
    expect(decidir(t('2026-11-09T23:30:00'), comMudanca, robo(u))).toBeNull();
    expect(decidir(t('2026-11-10T07:30:00'), comMudanca, robo(u))).toBeNull();
    expect(decidir(t('2026-11-10T08:00:00'), comMudanca, robo(envio('2026-11-09T22:30:00', '2026-11-09T22:30:00', semMudanca)))).toBe('rodada');
  });
  it('mesma rodada já enviada (reinício às 14:37 após 14:30) não repete', () => {
    const u = envio('2026-11-10T14:30:05', '2026-11-10T14:30:00', semMudanca);
    expect(decidir(t('2026-11-10T14:37:00'), comMudanca, robo(u))).toBeNull();
    expect(decidir(t('2026-11-10T15:00:00'), comMudanca, robo(u))).toBe('rodada');
  });
  it('sem mudança não envia', () => {
    const u = envio('2026-11-10T14:00:05', '2026-11-10T14:00:00', semMudanca);
    expect(decidir(t('2026-11-10T14:30:00'), semMudanca, robo(u))).toBeNull();
  });
  describe('lembrete e prazo', () => {
    const pend = foto({ principal: [item(1, 'Ana', true), item(2, 'Bia', false)] });
    const u = envio('2026-11-11T11:30:05', '2026-11-11T11:30:00', pend);
    it('quarta 12:00 com mensalista pendente: lembrete', () => {
      expect(decidir(t('2026-11-11T12:00:00'), pend, robo(u))).toBe('lembrete');
    });
    it('quarta 12:00 todos confirmados e sem mudança: null', () => {
      const ok = foto({ principal: [item(1, 'Ana', true)] });
      expect(decidir(t('2026-11-11T12:00:00'), ok, robo(envio('2026-11-11T11:30:05', '2026-11-11T11:30:00', ok)))).toBeNull();
    });
    it('quarta 12:00 pendente só diarista: segue regras normais', () => {
      const d = foto({ principal: [item(1, 'Ana', true), item(2, 'Duda', false, 'D')] });
      expect(decidir(t('2026-11-11T12:00:00'), d, robo(envio('2026-11-11T11:30:05', '2026-11-11T11:30:00', d)))).toBeNull();
    });
    it('quarta 12:40 (perdeu as 12:00) não é lembrete', () => {
      expect(decidir(t('2026-11-11T12:40:00'), pend, robo(u))).not.toBe('lembrete');
    });
    it('quarta 14:00: prazo, mesmo sem mudança', () => {
      const ok = foto({ principal: [item(1, 'Ana', true)] });
      expect(decidir(t('2026-11-11T14:00:00'), ok, robo(envio('2026-11-11T13:30:05', '2026-11-11T13:30:00', ok)))).toBe('prazo');
    });
    it('quarta 20:30 volta ao normal: null (fim da janela)', () => {
      expect(decidir(t('2026-11-11T20:30:00'), pend, robo(u))).toBeNull();
      expect(decidir(t('2026-11-11T20:00:00'), pend, robo(envio('2026-11-11T19:30:05', '2026-11-11T19:30:00', pend)))).toBeNull();
    });
  });
  it('cancelada avisa uma vez; depois null; reaberta: voltou', () => {
    const canc = foto({ estadoManual: 'cancelada' });
    const normal = foto();
    const u0 = envio('2026-11-10T10:00:05', '2026-11-10T10:00:00', normal);
    expect(decidir(t('2026-11-10T10:30:00'), canc, robo(u0))).toBe('cancelada');
    const u1 = envio('2026-11-10T10:30:05', '2026-11-10T10:30:00', canc);
    expect(decidir(t('2026-11-10T11:00:00'), canc, robo(u1))).toBeNull();
    expect(decidir(t('2026-11-10T11:00:00'), normal, robo(u1))).toBe('voltou');
  });
  it('virada de semana: último envio da quarta passada não vira cabeçalho', () => {
    const passada = foto({ data: '2026-11-04', principal: [item(1, 'Ana', true)] });
    const u = envio('2026-11-04T20:00:05', '2026-11-04T20:00:00', passada);
    const nova = foto({ principal: [item(1, 'Ana'), item(2, 'Bia', true)] });
    const e = robo(u, '2026-11-04');
    expect(decidir(t('2026-11-09T14:00:00'), nova, e)).toBe('abertura');
    const msg = montarMensagem('abertura', estado({ principal: [item(1, 'Ana')] }), nova, null);
    expect(msg).not.toMatch(/Confirmaram|Saíram|Entraram/);
    // sem abertura em terça: primeira, não rodada
    expect(decidir(t('2026-11-10T09:00:00'), nova, robo(u, '2026-11-09'))).toBe('primeira');
  });
  it('abertura não repete depois de cancelada/voltou na segunda', () => {
    const normal = foto();
    const canc = foto({ estadoManual: 'cancelada' });
    expect(decidir(t('2026-11-09T14:00:00'), canc, robo(null, null))).toBe('cancelada');
    const u1 = envio('2026-11-09T14:00:05', '2026-11-09T14:00:00', canc);
    expect(decidir(t('2026-11-09T15:00:00'), normal, robo(u1, null))).toBe('voltou');
    const u2 = envio('2026-11-09T15:00:05', '2026-11-09T15:00:00', normal);
    expect(decidir(t('2026-11-09T15:30:00'), normal, robo(u2, null))).toBeNull();
  });
  it('abertura ainda sai na segunda se o único último é da semana passada', () => {
    const passada = foto({ data: '2026-11-04' });
    const u = envio('2026-11-04T20:00:05', '2026-11-04T20:00:00', passada);
    expect(decidir(t('2026-11-09T15:00:00'), foto(), robo(u, '2026-11-04'))).toBe('abertura');
  });
});
