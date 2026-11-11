// Comandos de consulta do robô (artilheiro, garçom, ranking, times). Só leitura, com as mesmas
// fontes das ferramentas da IA e da tela de Ranking.
import type { DB } from '@/db/client';
import { parametroDoPeriodo } from '@/domain/periodo';
import type { Periodo } from '@/domain/ranking';
import { dataDe, nomeDoMes } from '@/domain/tempo';
import { timesDaPelada } from '@/server/times';
import type { Consulta } from './comandos';
import { EMOJI_COR } from './sorteio-zap';
import { ordenarArtilharia, peladaDaNoite, rankingDoPeriodoPedido } from './ferramentas';

export const TEXTO_SEM_TIMES = '👕 Os times de hoje ainda não foram sorteados.';

/** "novembro" (mês atual) ou "geral"; o ano só aparece se um dia o período for um ano. */
function rotulo(p: Periodo): string {
  if (p.tipo === 'geral') return 'geral';
  if (p.tipo === 'ano') return String(p.ano);
  return nomeDoMes(parametroDoPeriodo(p)).split(' de ')[0];
}

const maiuscula = (s: string) => s[0].toUpperCase() + s.slice(1);

function topo(titulo: string, p: Periodo, linhas: { nome: string; valor: number }[]): string {
  return `${titulo} (${rotulo(p)}):\n${linhas.map((l, i) => `${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} ${l.nome} ${l.valor}`).join('\n')}`;
}

async function textoDosTimes(db: DB, now: Date): Promise<string> {
  const p = await peladaDaNoite(db, now);
  if (!p || p.data !== dataDe(now)) return TEXTO_SEM_TIMES;
  const ts = await timesDaPelada(db, p.id);
  if (!ts.length) return TEXTO_SEM_TIMES;
  const blocos = ts.map((t) => [`${EMOJI_COR[t.cor]} ${maiuscula(t.cor)}`, ...t.jogadores.map((j) => `- ${j.nome}`), ...t.completes.map(() => '- COMPLETE')].join('\n'));
  return `👕 Times de hoje:\n\n${blocos.join('\n\n')}`;
}

export async function consultar(db: DB, tipo: Consulta, now: Date): Promise<string> {
  if (tipo === 'times') return textoDosTimes(db, now);
  const { periodo, linhas } = await rankingDoPeriodoPedido(db, now);
  if (tipo === 'artilheiro') {
    const top = ordenarArtilharia(linhas).slice(0, 3);
    return top.length ? topo('⚽ Artilheiros', periodo, top.map((l) => ({ nome: l.nome, valor: l.gols }))) : 'Ninguém fez gol ainda.';
  }
  if (tipo === 'garcom') {
    const top = linhas
      .filter((l) => l.assistencias > 0)
      .sort((a, b) => b.assistencias - a.assistencias || b.gols - a.gols || a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, 3);
    return top.length ? topo('🎯 Garçons', periodo, top.map((l) => ({ nome: l.nome, valor: l.assistencias }))) : 'Ninguém deu assistência ainda.';
  }
  const top = linhas.slice(0, 5);
  return top.length ? topo('🏆 Ranking', periodo, top.map((l) => ({ nome: l.nome, valor: l.pontos }))) : 'Ainda não tem partida no ranking.';
}
