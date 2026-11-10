import { describe, expect, it } from 'vitest';
import {
  TEXTO_AJUDA,
  interpretar,
  respostaFalta,
  respostaFila,
  respostaListaSemMudanca,
} from '@/robo/comandos';
import type { ItemLista } from '@/domain/lista';
import type { EstadoDaSemana } from '@/server/presencas';

const it_ = (nome: string, confirmado: boolean, id = 1): ItemLista => ({ jogadorId: id, nome, tipo: 'M', confirmado });
function estado(principal: ItemLista[], fila: ItemLista[] = []): EstadoDaSemana {
  return {
    aberta: true,
    cancelada: false,
    principal,
    fila,
    vagas: 16,
    peladaId: 1,
    data: '2026-11-11',
    estadoManual: 'auto',
    foraDoPrazo: [],
  } as unknown as EstadoDaSemana;
}

describe('interpretar', () => {
  it.each([
    ['', 'lista'],
    ['   ', 'lista'],
    ['lista', 'lista'],
    ['  LISTA ', 'lista'],
    ['Lista?', 'lista'],
    ['falta', 'falta'],
    ['falta confirmar', 'falta'],
    ['Quem falta', 'falta'],
    ['quem   falta  confirmar?', 'falta'],
    ['fila', 'fila'],
    ['Fíla', 'fila'],
    ['ajuda', 'ajuda'],
    ['AJUDA!', 'ajuda'],
    ['sortear', 'sortear'],
    ['Sorteia', 'sortear'],
    ['sorteio', 'sortear'],
    ['sim', 'sim'],
    ['SIM.', 'sim'],
  ])('"%s" -> %s', (texto, tipo) => {
    expect(interpretar(texto)).toEqual({ tipo });
  });

  it('texto extra depois do comando vira pergunta', () => {
    expect(interpretar('lista por favor')).toEqual({ tipo: 'pergunta', texto: 'lista por favor' });
    expect(interpretar('  o João   vem? ')).toEqual({ tipo: 'pergunta', texto: 'o João vem?' });
  });
});

describe('respostas fixas', () => {
  it('falta: pendentes da principal', () => {
    const e = estado([it_('Ana', true, 1), it_('Bia', false, 2), it_('Caio', false, 3), it_('Davi', false, 4)]);
    expect(respostaFalta(e)).toBe('Ainda não confirmaram: Bia, Caio e Davi.');
  });
  it('falta: um só', () => {
    expect(respostaFalta(estado([it_('Ana', false)]))).toBe('Ainda não confirmaram: Ana.');
  });
  it('falta: todos confirmaram', () => {
    expect(respostaFalta(estado([it_('Ana', true)]))).toBe('Todo mundo da lista já confirmou.');
    expect(respostaFalta(estado([]))).toBe('Todo mundo da lista já confirmou.');
  });
  it('fila numerada', () => {
    const e = estado([], [it_('X', false, 1), it_('Y', false, 2)]);
    expect(respostaFila(e)).toBe('Fila:\n1. X\n2. Y');
  });
  it('fila vazia', () => {
    expect(respostaFila(estado([]))).toBe('Ninguém na fila.');
  });
  it('lista sem mudança', () => {
    expect(respostaListaSemMudanca('15:30')).toBe('A lista não mudou desde as 15:30.');
  });
  it('ajuda cita os comandos e uma pergunta livre', () => {
    for (const c of ['lista', 'falta confirmar', 'fila', 'sortear']) expect(TEXTO_AJUDA).toContain(c);
    expect(TEXTO_AJUDA).toContain('?');
  });
});
