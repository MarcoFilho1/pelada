import { describe, expect, it } from 'vitest';
import {
  TEXTO_AJUDA,
  interpretar,
  respostaFalta,
  respostaFila,
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
    ['sortear de novo', 'sortear'],
    ['Sorteia de novo!', 'sortear'],
    ['sortear novamente', 'sortear'],
    ['sim', 'sim'],
    ['SIM.', 'sim'],
    ['artilheiro', 'artilheiro'],
    ['Artilheiros?', 'artilheiro'],
    ['artilharia', 'artilheiro'],
    ['garçom', 'garcom'],
    ['GARCOM', 'garcom'],
    ['garçons', 'garcom'],
    ['ranking', 'ranking'],
    ['times', 'times'],
    ['Times?', 'times'],
  ])('"%s" -> %s', (texto, tipo) => {
    expect(interpretar(texto)).toEqual({ tipo });
  });

  it.each([
    ['adicionar Pepe', 'adicionar', 'Pepe'],
    ['Adicionar   João  Pedro!', 'adicionar', 'João Pedro'],
    ['adicionar lista Pepe', 'adicionar', 'Pepe'],
    ['adicionar na lista Pepe', 'adicionar', 'Pepe'],
    ['confirmar Ana Paula', 'confirmar', 'Ana Paula'],
    ['CONFIRMAR bia.', 'confirmar', 'bia'],
    ['remover Caio', 'remover', 'Caio'],
    ['remove Caio', 'remover', 'Caio'],
  ])('"%s" -> %s com o nome', (texto, tipo, nome) => {
    expect(interpretar(texto)).toEqual({ tipo, nome });
  });

  it('nome com mais de 40 caracteres: recusa sem repetir o texto', () => {
    const longo = 'a'.repeat(41);
    expect(interpretar(`adicionar ${longo}`)).toEqual({ tipo: 'recusa', texto: '🤔 Nome muito comprido.' });
    expect(interpretar(`remover ${'b'.repeat(5000)}`)).toEqual({ tipo: 'recusa', texto: '🤔 Nome muito comprido.' });
    expect(interpretar(`confirmar ${'c'.repeat(40)}`)).toEqual({ tipo: 'confirmar', nome: 'c'.repeat(40) });
  });

  it('comando de lista sem nome vira pergunta (ajuda ou IA)', () => {
    expect(interpretar('adicionar')).toEqual({ tipo: 'pergunta', texto: 'adicionar' });
    expect(interpretar('adicionar lista')).toEqual({ tipo: 'pergunta', texto: 'adicionar lista' });
    expect(interpretar('confirmar')).toEqual({ tipo: 'pergunta', texto: 'confirmar' });
  });

  it('texto extra depois do comando vira pergunta', () => {
    expect(interpretar('lista por favor')).toEqual({ tipo: 'pergunta', texto: 'lista por favor' });
    expect(interpretar('  o João   vem? ')).toEqual({ tipo: 'pergunta', texto: 'o João vem?' });
  });
});

describe('respostas fixas', () => {
  it('falta: pendentes da principal', () => {
    const e = estado([it_('Ana', true, 1), it_('Bia', false, 2), it_('Caio', false, 3), it_('Davi', false, 4)]);
    expect(respostaFalta(e)).toBe('⏳ Ainda não confirmaram: Bia, Caio e Davi.');
  });
  it('falta: um só', () => {
    expect(respostaFalta(estado([it_('Ana', false)]))).toBe('⏳ Ainda não confirmaram: Ana.');
  });
  it('falta: todos confirmaram', () => {
    expect(respostaFalta(estado([it_('Ana', true)]))).toBe('🙌 Todo mundo da lista já confirmou!');
    expect(respostaFalta(estado([]))).toBe('🙌 Todo mundo da lista já confirmou!');
  });
  it('fila numerada', () => {
    const e = estado([], [it_('X', false, 1), it_('Y', false, 2)]);
    expect(respostaFila(e)).toBe('📝 Fila:\n1. X\n2. Y');
  });
  it('fila vazia', () => {
    expect(respostaFila(estado([]))).toBe('📝 Ninguém na fila.');
  });
  it('ajuda cita todos os comandos, em texto simples', () => {
    for (const c of ['lista', 'falta confirmar', 'fila', 'sortear', 'adicionar', 'confirmar', 'remover', 'artilheiro', 'garçom', 'ranking', 'times']) {
      expect(TEXTO_AJUDA).toContain(c);
    }
    expect(TEXTO_AJUDA).not.toMatch(/[*_~`]/);
  });
});
