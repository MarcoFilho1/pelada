import { describe, expect, it } from 'vitest';
import type { Periodo } from '@/domain/ranking';
import { alvoDaAba, nomeDoPeriodo, parametroDoPeriodo, periodoDaUrl, periodoPadrao, vizinhos } from '@/domain/periodo';

const disp = { anos: [2026, 2025], meses: ['2026-11', '2026-10', '2025-12'] };
// 05/11/2026 01:00 UTC ainda é 04/11 em Recife; 01/12/2026 01:00 UTC ainda é novembro lá.
const emNovembro = new Date('2026-11-05T01:00:00Z');
const geral: Periodo = { tipo: 'geral' };

describe('periodoPadrao', () => {
  it('é o mês atual em Recife quando ele tem partida encerrada', () => {
    expect(periodoPadrao(emNovembro, disp)).toEqual({ tipo: 'mes', ano: 2026, mes: 11 });
    expect(periodoPadrao(new Date('2026-12-01T01:00:00Z'), disp)).toEqual({ tipo: 'mes', ano: 2026, mes: 11 });
  });
  it('senão é o geral', () => {
    expect(periodoPadrao(new Date('2026-12-01T12:00:00Z'), disp)).toEqual(geral);
    expect(periodoPadrao(emNovembro, { anos: [], meses: [] })).toEqual(geral);
  });
});

describe('periodoDaUrl', () => {
  it('lê geral, ano e mês disponíveis', () => {
    expect(periodoDaUrl('geral', disp, emNovembro)).toEqual(geral);
    expect(periodoDaUrl('2025', disp, emNovembro)).toEqual({ tipo: 'ano', ano: 2025 });
    expect(periodoDaUrl('2026-10', disp, emNovembro)).toEqual({ tipo: 'mes', ano: 2026, mes: 10 });
  });
  it('sem parâmetro, inválido ou sem partidas: cai no padrão sem erro', () => {
    const padrao = { tipo: 'mes', ano: 2026, mes: 11 };
    for (const p of [undefined, '', 'xyz', '2024', '2026-09', '2026-1', '2026-13', '02026', ['2025', 'geral'], '2026-11-01']) {
      expect(periodoDaUrl(p, disp, emNovembro)).toEqual(padrao);
    }
  });
});

describe('parametroDoPeriodo e nomeDoPeriodo', () => {
  it('ida e volta pela URL', () => {
    const ps: Periodo[] = [geral, { tipo: 'ano', ano: 2025 }, { tipo: 'mes', ano: 2026, mes: 10 }];
    expect(ps.map(parametroDoPeriodo)).toEqual(['geral', '2025', '2026-10']);
    for (const p of ps) expect(periodoDaUrl(parametroDoPeriodo(p), disp, emNovembro)).toEqual(p);
  });
  it('nome para a tela', () => {
    expect(nomeDoPeriodo(geral)).toBe('Geral');
    expect(nomeDoPeriodo({ tipo: 'ano', ano: 2025 })).toBe('2025');
    expect(nomeDoPeriodo({ tipo: 'mes', ano: 2026, mes: 3 })).toBe('Março de 2026');
  });
});

describe('vizinhos', () => {
  it('mês anterior (mais antigo) e seguinte entre os disponíveis', () => {
    expect(vizinhos({ tipo: 'mes', ano: 2026, mes: 10 }, disp)).toEqual({
      anterior: { tipo: 'mes', ano: 2025, mes: 12 },
      seguinte: { tipo: 'mes', ano: 2026, mes: 11 },
    });
    expect(vizinhos({ tipo: 'mes', ano: 2026, mes: 11 }, disp)).toEqual({ anterior: { tipo: 'mes', ano: 2026, mes: 10 } });
  });
  it('ano e geral', () => {
    expect(vizinhos({ tipo: 'ano', ano: 2025 }, disp)).toEqual({ seguinte: { tipo: 'ano', ano: 2026 } });
    expect(vizinhos(geral, disp)).toEqual({});
  });
});

describe('abas', () => {
  it('Ano mantém o ano do mês escolhido; Mês leva ao mês mais recente do ano escolhido', () => {
    expect(alvoDaAba('ano', { tipo: 'mes', ano: 2025, mes: 12 }, disp)).toEqual({ tipo: 'ano', ano: 2025 });
    expect(alvoDaAba('ano', geral, disp)).toEqual({ tipo: 'ano', ano: 2026 });
    expect(alvoDaAba('mes', { tipo: 'ano', ano: 2025 }, disp)).toEqual({ tipo: 'mes', ano: 2025, mes: 12 });
    expect(alvoDaAba('mes', geral, disp)).toEqual({ tipo: 'mes', ano: 2026, mes: 11 });
    expect(alvoDaAba('mes', { tipo: 'mes', ano: 2026, mes: 10 }, disp)).toEqual({ tipo: 'mes', ano: 2026, mes: 10 });
    expect(alvoDaAba('geral', { tipo: 'ano', ano: 2025 }, disp)).toEqual(geral);
  });
  it('sem partidas, Ano e Mês não têm para onde ir', () => {
    const vazio = { anos: [], meses: [] };
    expect(alvoDaAba('ano', geral, vazio)).toBeNull();
    expect(alvoDaAba('mes', geral, vazio)).toBeNull();
  });
});
