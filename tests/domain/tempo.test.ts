import { describe, expect, it } from 'vitest';
import {
  aberturaLista,
  dataDe,
  diaDaSemana,
  diaMes,
  inicioJogo,
  mesDaQuarta,
  mesDe,
  prazoMensalista,
  proximaQuarta,
} from '@/domain/tempo';

describe('proximaQuarta', () => {
  it('segunda aponta para a quarta da semana', () => {
    expect(proximaQuarta(new Date('2026-11-02T10:00:00-03:00'))).toBe('2026-11-04');
  });
  it('quarta de dia ainda é a quarta de hoje', () => {
    expect(proximaQuarta(new Date('2026-11-04T22:29:59-03:00'))).toBe('2026-11-04');
  });
  it('depois de quarta 22:30 passa para a próxima', () => {
    expect(proximaQuarta(new Date('2026-11-04T22:30:00-03:00'))).toBe('2026-11-11');
    expect(proximaQuarta(new Date('2026-11-04T23:00:00-03:00'))).toBe('2026-11-11');
  });
  it('quinta a domingo apontam para a quarta seguinte', () => {
    expect(proximaQuarta(new Date('2026-11-05T09:00:00-03:00'))).toBe('2026-11-11');
    expect(proximaQuarta(new Date('2026-11-08T23:59:00-03:00'))).toBe('2026-11-11');
  });
  it('usa o fuso de Recife, não o UTC', () => {
    // 2026-11-05T01:00Z ainda é quarta 22:00 em Recife
    expect(proximaQuarta(new Date('2026-11-05T01:00:00Z'))).toBe('2026-11-04');
  });
  it('atravessa virada de mês', () => {
    expect(proximaQuarta(new Date('2026-11-27T12:00:00-03:00'))).toBe('2026-12-02');
  });
});

describe('marcos da semana', () => {
  it('abertura é segunda 00:00 -03:00', () => {
    expect(aberturaLista('2026-11-04').toISOString()).toBe('2026-11-02T03:00:00.000Z');
  });
  it('prazo do mensalista é quarta 14:00 -03:00', () => {
    expect(prazoMensalista('2026-11-04').toISOString()).toBe('2026-11-04T17:00:00.000Z');
  });
  it('início do jogo é quarta 20:30 -03:00', () => {
    expect(inicioJogo('2026-11-04').toISOString()).toBe('2026-11-04T23:30:00.000Z');
  });
  it('abertura cruza o mês quando a quarta é dia 1 a 2', () => {
    expect(aberturaLista('2026-12-02').toISOString()).toBe('2026-11-30T03:00:00.000Z');
  });
});

describe('mesDaQuarta', () => {
  it('é o mês da data da quarta', () => {
    expect(mesDaQuarta('2026-12-02')).toBe('2026-12');
    expect(mesDaQuarta('2026-11-25')).toBe('2026-11');
  });
  it('mantém mesDe', () => {
    expect(mesDe(new Date('2026-12-01T02:00:00Z'))).toBe('2026-11');
  });
});

describe('rótulos de data (Recife)', () => {
  it('dataDe dá o dia em Recife, não em UTC', () => {
    expect(dataDe(new Date('2026-11-05T01:00:00Z'))).toBe('2026-11-04');
    expect(dataDe(new Date('2026-11-05T03:00:00Z'))).toBe('2026-11-05');
  });
  it('diaMes vira DD/MM', () => {
    expect(diaMes('2026-11-04')).toBe('04/11');
  });
  it('diaDaSemana dá o dia por extenso e a data, em Recife', () => {
    expect(diaDaSemana(aberturaLista('2026-11-11'))).toBe('segunda, 09/11');
    expect(diaDaSemana(new Date('2026-11-05T01:00:00Z'))).toBe('quarta, 04/11');
  });
});
