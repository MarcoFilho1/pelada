import { describe, expect, it } from 'vitest';
import { textoWhatsApp } from '@/domain/copiarLista';
import type { EstadoLista } from '@/domain/lista';

const QUARTA = '2026-11-04';

const estadoBase: EstadoLista = {
  aberta: true,
  cancelada: false,
  principal: [
    { jogadorId: 1, nome: 'Pepe', tipo: 'M', confirmado: true },
    { jogadorId: 2, nome: 'Nandinho', tipo: 'D', confirmado: false },
  ],
  fila: [{ jogadorId: 3, nome: 'Bruno', tipo: 'D', confirmado: false }],
  vagas: 16,
};

describe('textoWhatsApp', () => {
  it('mensalista que saiu e voltou (tipo D) aparece com (M)', () => {
    const estado: EstadoLista = {
      aberta: true,
      cancelada: false,
      vagas: 2,
      principal: [{ jogadorId: 1, nome: 'Ana', tipo: 'D', confirmado: false, marca: 'M' }],
      fila: [],
    };
    expect(textoWhatsApp(estado, '2026-11-11')).toContain('1. Ana (M) ⏳');
  });

  it('lista com 2 na principal e Bruno na fila', () => {
    const esperado = [
      'Pelada 04/11 - 20:30-22:30',
      '',
      '1. Pepe (M) ✅',
      '2. Nandinho (D) ⏳',
      '3.',
      '4.',
      '5.',
      '6.',
      '7.',
      '8.',
      '9.',
      '10.',
      '11.',
      '12.',
      '13.',
      '14.',
      '15.',
      '16.',
      '',
      'Interessados pra diarista',
      '1. Bruno',
    ].join('\n');

    expect(textoWhatsApp(estadoBase, QUARTA)).toBe(esperado);
  });

  it('fila vazia mostra "1." sozinho', () => {
    const texto = textoWhatsApp({ ...estadoBase, fila: [] }, QUARTA);
    expect(texto.endsWith('\n\nInteressados pra diarista\n1.')).toBe(true);
  });

  it('numera conforme estado.vagas', () => {
    const texto = textoWhatsApp({ ...estadoBase, vagas: 3, fila: [] }, QUARTA);
    expect(texto).toBe(
      [
        'Pelada 04/11 - 20:30-22:30',
        '',
        '1. Pepe (M) ✅',
        '2. Nandinho (D) ⏳',
        '3.',
        '',
        'Interessados pra diarista',
        '1.',
      ].join('\n'),
    );
  });

  it('lista cancelada troca só a primeira linha', () => {
    const texto = textoWhatsApp({ ...estadoBase, cancelada: true }, QUARTA);
    const linhas = texto.split('\n');
    expect(linhas[0]).toBe('Pelada 04/11 - CANCELADA');
    expect(linhas.slice(1).join('\n')).toBe(
      textoWhatsApp(estadoBase, QUARTA).split('\n').slice(1).join('\n'),
    );
  });

  it('não tem espaço no fim de linha nem quebra de linha no fim', () => {
    const texto = textoWhatsApp(estadoBase, QUARTA);
    expect(texto.endsWith('\n')).toBe(false);
    for (const linha of texto.split('\n')) {
      expect(linha).toBe(linha.trimEnd());
    }
  });

  it('data DD/MM vem da string YYYY-MM-DD sem parsear Date', () => {
    const texto = textoWhatsApp(estadoBase, '2026-12-30');
    expect(texto.split('\n')[0]).toBe('Pelada 30/12 - 20:30-22:30');
  });
});
