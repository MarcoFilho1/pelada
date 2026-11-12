import { describe, expect, it } from 'vitest';
import {
  TEXTO_AJUDA,
  TEXTO_SO_3_OU_4,
  TEXTO_NOME_COMPRIDO,
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

describe('interpretar: vários nomes numa mensagem', () => {
  const varios = (tipo: string, nomes: string[], excedeu = false) => ({ tipo, nome: nomes[0], nomes, excedeu });
  it.each([
    ['adicionar Ana, Beto, Caio', varios('adicionar', ['Ana', 'Beto', 'Caio'])],
    ['confirmar Ana e Beto', varios('confirmar', ['Ana', 'Beto'])],
    ['remover Ana, Beto e Caio', varios('remover', ['Ana', 'Beto', 'Caio'])],
    ['remover Ana E Beto', varios('remover', ['Ana', 'Beto'])],
    ['adicionar lista Ana, Beto e Caio', varios('adicionar', ['Ana', 'Beto', 'Caio'])],
    ['adicionar na lista Ana e Beto', varios('adicionar', ['Ana', 'Beto'])],
    ['  adicionar   Ana Paula ,  Beto   e   Caio  ', varios('adicionar', ['Ana Paula', 'Beto', 'Caio'])],
    ['adicionar Ana,, Beto, ,Caio.', varios('adicionar', ['Ana', 'Beto', 'Caio'])],
    ['adicionar A, B, C, D, E', varios('adicionar', ['A', 'B', 'C'], true)],
  ])('"%s"', (texto, esperado) => {
    expect(interpretar(texto)).toEqual(esperado);
  });
  it('"é" não separa nomes', () => {
    expect(interpretar('adicionar Pedro é craque')).toEqual({ tipo: 'adicionar', nome: 'Pedro é craque' });
    expect(interpretar('remover Ana é Beto')).toEqual({ tipo: 'remover', nome: 'Ana é Beto' });
  });
  it('nome único (mesmo com vírgula sobrando) segue como antes', () => {
    expect(interpretar('adicionar Pepe,')).toEqual({ tipo: 'adicionar', nome: 'Pepe' });
    expect(interpretar('adicionar Pedro Neves')).toEqual({ tipo: 'adicionar', nome: 'Pedro Neves' });
    expect(interpretar(`adicionar ${'c'.repeat(41)}`)).toEqual({ tipo: 'recusa', texto: TEXTO_NOME_COMPRIDO });
  });
  it('o teto de 40 caracteres vale por nome, não pelo texto todo', () => {
    const a = 'a'.repeat(30);
    const b = 'b'.repeat(30);
    expect(interpretar(`adicionar ${a}, ${b}`)).toEqual(varios('adicionar', [a, b]));
  });
});

describe('interpretar: sortear em 3 ou 4 times', () => {
  it.each([
    ['sortear', 4],
    ['Sorteia', 4],
    ['sorteio', 4],
    ['sortear de novo', 4],
    ['Sorteia de novo!', 4],
    ['sortear novamente', 4],
    ['sortear 3', 3],
    ['sortear 3 times', 3],
    ['Sortear 3 Times!', 3],
    ['sorteia 3 times', 3],
    ['sortear em 3 times', 3],
    ['sortear três times', 3],
    ['sortear de novo 3 times', 3],
    ['sortear de novo em 3', 3],
    ['sortear novamente 3 times', 3],
    ['sortear 4 times', 4],
    ['sortear 4', 4],
    ['SORTEAR QUATRO TIMES', 4],
    ['sortear 3 time', 3],
  ])('"%s" -> %i times', (texto, times) => {
    expect(interpretar(texto)).toEqual({ tipo: 'sortear', times });
  });

  it.each(['sortear 2 times', 'sortear 5', 'sortear de novo 6 times', 'sortear 10 times'])('"%s": recusa curta', (texto) => {
    expect(interpretar(texto)).toEqual({ tipo: 'recusa', texto: TEXTO_SO_3_OU_4 });
  });

  it('frase livre com "sortear" continua pergunta', () => {
    expect(interpretar('sortear os times aí')).toEqual({ tipo: 'pergunta', texto: 'sortear os times aí' });
  });
});

describe('TEXTO_AJUDA', () => {
  it('lembra do sorteio em 3 times', () => {
    expect(TEXTO_AJUDA).toContain('(ou sortear 3 times)');
  });

  it('avisa que aceita até 3 nomes', () => {
    expect(TEXTO_AJUDA.match(/até 3 nomes: A, B e C/g)).toHaveLength(3);
  });
});
