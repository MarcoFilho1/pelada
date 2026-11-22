import { describe, expect, it } from 'vitest';
import type { LinhaRankingComNota as LinhaRanking } from '@/domain/ranking';
import { ORDEM_PADRAO, ordenarLinhas, proximaOrdem } from '@/app/(jogador)/ranking/ordenar';

const linha = (jogadorId: number, nome: string, pontos: number, gols: number, derrotas = 0, nota = 3): LinhaRanking => ({
  jogadorId,
  nome,
  pontos,
  jogos: 3,
  vitorias: 0,
  empates: 0,
  derrotas,
  aproveitamento: 0,
  gols,
  assistencias: 0,
  golsPorJogo: gols / 3,
  presencas: 1,
  nota,
});

// Na ordem do domínio (o ranking).
const linhas = [linha(1, 'Caio', 9, 1, 0, 3.5), linha(2, 'Ébano', 7, 4, 2, 2), linha(3, 'beto', 5, 4, 0, 4.5), linha(4, 'Davi', 2, 0, 1, 3.5)];
const ids = (r: { linha: LinhaRanking }[]) => r.map((x) => x.linha.jogadorId);

describe('ordenarLinhas', () => {
  it('padrão: a ordem do ranking, com a posição de cada um', () => {
    const r = ordenarLinhas(linhas, ORDEM_PADRAO);
    expect(ids(r)).toEqual([1, 2, 3, 4]);
    expect(r.map((x) => x.posicao)).toEqual([1, 2, 3, 4]);
  });

  it('coluna numérica: maior primeiro, empate pela posição no ranking; a posição não muda', () => {
    const r = ordenarLinhas(linhas, { coluna: 'gols', invertida: false });
    expect(ids(r)).toEqual([2, 3, 1, 4]);
    expect(r.map((x) => x.posicao)).toEqual([2, 3, 1, 4]);
    expect(ids(ordenarLinhas(linhas, { coluna: 'derrotas', invertida: false }))).toEqual([2, 4, 1, 3]);
  });

  it('nota: maior primeiro, empate pela posição', () => {
    expect(ids(ordenarLinhas(linhas, { coluna: 'nota', invertida: false }))).toEqual([3, 1, 4, 2]);
  });

  it('nome: alfabética sem diferenciar acento e maiúscula', () => {
    expect(ids(ordenarLinhas(linhas, { coluna: 'nome', invertida: false }))).toEqual([3, 1, 4, 2]);
  });

  it('invertida: a lista inteira ao contrário', () => {
    expect(ids(ordenarLinhas(linhas, { coluna: 'gols', invertida: true }))).toEqual([4, 1, 3, 2]);
    expect(ids(ordenarLinhas(linhas, { coluna: 'posicao', invertida: true }))).toEqual([4, 3, 2, 1]);
  });

  it('não mexe no array recebido', () => {
    const copia = [...linhas];
    ordenarLinhas(linhas, { coluna: 'gols', invertida: false });
    expect(linhas).toEqual(copia);
  });
});

describe('proximaOrdem', () => {
  it('outra coluna começa no sentido natural; a mesma coluna inverte', () => {
    const g = proximaOrdem(ORDEM_PADRAO, 'gols');
    expect(g).toEqual({ coluna: 'gols', invertida: false });
    expect(proximaOrdem(g, 'gols')).toEqual({ coluna: 'gols', invertida: true });
    expect(proximaOrdem(proximaOrdem(g, 'gols'), 'gols')).toEqual({ coluna: 'gols', invertida: false });
    expect(proximaOrdem(ORDEM_PADRAO, 'posicao')).toEqual({ coluna: 'posicao', invertida: true });
  });
});
