import { describe, expect, it } from 'vitest';
import type { ItemLista } from '@/domain/lista';
import type { EstadoDaSemana } from '@/server/presencas';
import { fotografar, haMudanca, juntarNomes, linhasDoCabecalho, mudancas, type FotoDaLista } from '@/robo/foto';

const it_ = (jogadorId: number, nome: string, confirmado = false, tipo: 'M' | 'D' = 'M'): ItemLista => ({
  jogadorId,
  nome,
  tipo,
  confirmado,
});

function estado(p: Partial<Pick<EstadoDaSemana, 'principal' | 'fila' | 'foraDoPrazo' | 'estadoManual'>> = {}): EstadoDaSemana {
  return {
    aberta: true,
    cancelada: false,
    principal: p.principal ?? [],
    fila: p.fila ?? [],
    vagas: 16,
    peladaId: 1,
    data: '2026-11-11',
    estadoManual: p.estadoManual ?? null,
    foraDoPrazo: p.foraDoPrazo ?? [],
  };
}

const foto = (p: Parameters<typeof estado>[0]) => fotografar(estado(p));
const vazia: Parameters<typeof mudancas>[0] = foto({});

describe('juntarNomes', () => {
  it('junta em pt-BR', () => {
    expect(juntarNomes([])).toBe('');
    expect(juntarNomes(['Ana'])).toBe('Ana');
    expect(juntarNomes(['Ana', 'Bia'])).toBe('Ana e Bia');
    expect(juntarNomes(['Ana', 'Bia', 'Caio'])).toBe('Ana, Bia e Caio');
  });
});

describe('fotografar', () => {
  it('registra onde cada um está', () => {
    const f = foto({
      principal: [it_(1, 'Ana', true), it_(2, 'Bia')],
      fila: [it_(3, 'Caio', false, 'D')],
      foraDoPrazo: [it_(4, 'Duda')],
      estadoManual: 'fechada',
    });
    expect(f.dataQuarta).toBe('2026-11-11');
    expect(f.estadoManual).toBe('fechada');
    expect(f.jogadores).toEqual({
      1: { nome: 'Ana', onde: 'confirmado', tipo: 'M' },
      2: { nome: 'Bia', onde: 'pendente', tipo: 'M' },
      3: { nome: 'Caio', onde: 'fila', tipo: 'D' },
      4: { nome: 'Duda', onde: 'prazo', tipo: 'M' },
    });
  });
});

describe('mudancas', () => {
  it('confirmou', () => {
    const m = mudancas(foto({ principal: [it_(1, 'Ana')] }), foto({ principal: [it_(1, 'Ana', true)] }));
    expect(m.confirmaram).toEqual(['Ana']);
    expect(linhasDoCabecalho(m)).toEqual(['Confirmaram: Ana.']);
  });

  it('confirmou e saiu no mesmo intervalo: só saiu', () => {
    const m = mudancas(foto({ principal: [it_(1, 'Ana')] }), foto({}));
    expect(m.sairam).toEqual(['Ana']);
    expect(m.confirmaram).toEqual([]);
    expect(linhasDoCabecalho(m)).toEqual(['Saíram: Ana.']);
  });

  it('mensalista sai e diarista sobe', () => {
    const antes = foto({ principal: [it_(1, 'X')], fila: [it_(2, 'Y', false, 'D')] });
    const depois = foto({ principal: [it_(2, 'Y', false, 'D')] });
    expect(linhasDoCabecalho(mudancas(antes, depois))).toEqual(['Saíram: X.', 'Subiram da fila: Y.']);
  });

  it('renomeado não vira saiu/entrou', () => {
    const m = mudancas(foto({ principal: [it_(1, 'Ana')] }), foto({ principal: [it_(1, 'Ana Maria')] }));
    expect(haMudanca(m)).toBe(false);
  });

  it('usa o nome novo ao confirmar depois de renomear', () => {
    const m = mudancas(foto({ principal: [it_(1, 'Ana')] }), foto({ principal: [it_(1, 'Ana Maria', true)] }));
    expect(m.confirmaram).toEqual(['Ana Maria']);
  });

  it('entrou na lista com vaga', () => {
    const m = mudancas(vazia, foto({ principal: [it_(1, 'Ana', false, 'D')] }));
    expect(m.entraramNaLista).toEqual(['Ana']);
    expect(linhasDoCabecalho(m)).toEqual(['Entraram na lista: Ana.']);
  });

  it('entrou na fila', () => {
    const m = mudancas(vazia, foto({ fila: [it_(1, 'Ana', false, 'D')] }));
    expect(m.entraramNaFila).toEqual(['Ana']);
    expect(linhasDoCabecalho(m)).toEqual(['Entraram na fila: Ana.']);
  });

  it('perdeu o prazo', () => {
    const m = mudancas(foto({ principal: [it_(1, 'Ana')] }), foto({ foraDoPrazo: [it_(1, 'Ana')] }));
    expect(m.perderamPrazo).toEqual(['Ana']);
    expect(m.sairam).toEqual([]);
    expect(linhasDoCabecalho(m)).toEqual(['Perderam o prazo: Ana.']);
  });

  it('quem já estava fora do prazo não repete', () => {
    const f = foto({ foraDoPrazo: [it_(1, 'Ana')] });
    expect(haMudanca(mudancas(f, f))).toBe(false);
  });

  it('admin fechou e reabriu', () => {
    const aberta = foto({});
    const fechada = foto({ estadoManual: 'fechada' });
    expect(mudancas(aberta, fechada).manual).toBe('fechou');
    expect(linhasDoCabecalho(mudancas(aberta, fechada))).toEqual(['O admin fechou a lista.']);
    expect(mudancas(fechada, aberta).manual).toBe('reabriu');
    expect(linhasDoCabecalho(mudancas(fechada, aberta))).toEqual(['O admin reabriu a lista.']);
    expect(mudancas(fechada, foto({ estadoManual: 'aberta' })).manual).toBe('reabriu');
    expect(haMudanca(mudancas(fechada, fechada))).toBe(false);
  });

  it('ordena os nomes em pt-BR', () => {
    const m = mudancas(vazia, foto({ principal: [it_(1, 'Érica'), it_(2, 'Zé'), it_(3, 'Ana'), it_(4, 'Eduardo')] }));
    expect(m.entraramNaLista).toEqual(['Ana', 'Eduardo', 'Érica', 'Zé']);
  });

  it('ordem das linhas com todos os tipos', () => {
    const antes: FotoDaLista = foto({
      principal: [it_(1, 'A'), it_(2, 'B'), it_(8, 'H')],
      fila: [it_(3, 'C', false, 'D'), it_(9, 'I', false, 'D')],
    });
    const depois: FotoDaLista = foto({
      principal: [it_(1, 'A', true), it_(3, 'C', false, 'D'), it_(4, 'D', false, 'D')],
      fila: [it_(5, 'E', false, 'D')],
      foraDoPrazo: [it_(8, 'H')],
      estadoManual: 'fechada',
    });
    expect(linhasDoCabecalho(mudancas(antes, depois))).toEqual([
      'Confirmaram: A.',
      'Saíram: B e I.',
      'Entraram na lista: D.',
      'Subiram da fila: C.',
      'Entraram na fila: E.',
      'Perderam o prazo: H.',
      'O admin fechou a lista.',
    ]);
  });
});
