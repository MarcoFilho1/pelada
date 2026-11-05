import type { LinhaRanking } from '@/domain/ranking';

/** Colunas que reordenam a tabela. `posicao` é a ordem do ranking (pontos e desempates). */
export type Coluna = 'posicao' | Exclude<keyof LinhaRanking, 'jogadorId'>;

export type Ordem = { coluna: Coluna; invertida: boolean };

export const ORDEM_PADRAO: Ordem = { coluna: 'posicao', invertida: false };

/** Tocar noutra coluna ordena por ela no sentido natural; tocar de novo inverte. */
export function proximaOrdem(atual: Ordem, coluna: Coluna): Ordem {
  return atual.coluna === coluna ? { coluna, invertida: !atual.invertida } : { coluna, invertida: false };
}

/**
 * Linhas na ordem pedida, cada uma com a posição no ranking (que não muda com a ordem).
 * Sentido natural: posição e nome crescentes, números do maior para o menor; empate pela posição.
 * Invertida: a lista inteira ao contrário. Recebe as linhas na ordem do ranking.
 */
export function ordenarLinhas(linhas: LinhaRanking[], ordem: Ordem): { linha: LinhaRanking; posicao: number }[] {
  const comPosicao = linhas.map((linha, i) => ({ linha, posicao: i + 1 }));
  const { coluna } = ordem;
  const natural = (a: (typeof comPosicao)[number], b: (typeof comPosicao)[number]) => {
    if (coluna === 'posicao') return a.posicao - b.posicao;
    if (coluna === 'nome') {
      return a.linha.nome.localeCompare(b.linha.nome, 'pt-BR', { sensitivity: 'base' }) || a.posicao - b.posicao;
    }
    return b.linha[coluna] - a.linha[coluna] || a.posicao - b.posicao;
  };
  return comPosicao.sort((a, b) => (ordem.invertida ? natural(b, a) : natural(a, b)));
}
