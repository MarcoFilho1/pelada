// O resumo do fim da pelada, no grupo: os destaques da noite numa mensagem e, depois, a tabela
// geral (artilharia, garçons, vitórias), cada uma na sua mensagem (como gente mandando, não um
// bloco só). Sai uma vez por noite, entre 22:35 e 22:40, quando nenhuma partida está em andamento.
import type { LinhaRanking } from '@/domain/ranking';
import { dataDe } from '@/domain/tempo';
import { emSilencio } from './agenda';
import { ordenarArtilharia } from './ferramentas';

/** Quantos aparecem em cada tabela geral. */
export const TOPO_GERAL = 5;

// Recife é sempre UTC-03:00 (sem horário de verão), como em tempo.ts.
const OFFSET_RECIFE_MS = -3 * 60 * 60 * 1000;

/**
 * A hora do resumo na noite `data`: 22:35 mais 0–5 min e alguns segundos, sempre a mesma para a
 * mesma data (um reinício do robô não muda a hora, e cada semana sai num minuto diferente).
 */
export function horaDoResumo(data: string): Date {
  let h = 2166136261;
  for (const c of data) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const segundos = h % (5 * 60 + 1);
  const base = Date.parse(`${data}T22:35:00Z`) - OFFSET_RECIFE_MS;
  return new Date(base + segundos * 1000);
}

/**
 * Se agora é hora de tentar o resumo de hoje: depois da hora do resumo, antes do silêncio das 23:00,
 * e ainda não mandado (`enviado` = data do último resumo).
 */
export function horaDeTentarResumo(now: Date, enviado: string | null | undefined): boolean {
  const hoje = dataDe(now);
  return enviado !== hoje && now >= horaDoResumo(hoje) && !emSilencio(now);
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "Ana", "Ana e Bia", "Ana, Bia e Caio". */
function nomes(ls: string[]): string {
  return ls.length <= 1 ? (ls[0] ?? '') : `${ls.slice(0, -1).join(', ')} e ${ls[ls.length - 1]}`;
}

/** Todos os empatados no máximo de `campo` (ninguém, se ninguém fez). */
function melhores(linhas: LinhaRanking[], campo: 'gols' | 'assistencias' | 'vitorias'): { nomes: string[]; valor: number } | null {
  const max = Math.max(0, ...linhas.map((l) => l[campo]));
  if (max === 0) return null;
  return { nomes: linhas.filter((l) => l[campo] === max).map((l) => l.nome), valor: max };
}

/** A mensagem dos destaques da noite; `null` se ninguém fez gol, assistência nem venceu. */
export function textoDaNoite(hoje: LinhaRanking[]): string | null {
  const art = melhores(hoje, 'gols');
  const gar = melhores(hoje, 'assistencias');
  const vit = melhores(hoje, 'vitorias');
  const linhas = [
    art && `⚽ Artilheiro: ${nomes(art.nomes)} (${plural(art.valor, 'gol', 'gols')})`,
    gar && `🎯 Garçom: ${nomes(gar.nomes)} (${plural(gar.valor, 'assistência', 'assistências')})`,
    vit && `🏆 Mais vitórias: ${nomes(vit.nomes)} (${plural(vit.valor, 'vitória', 'vitórias')})`,
  ].filter((l): l is string => !!l);
  return linhas.length ? `🏁 Fim de pelada! Destaques de hoje:\n${linhas.join('\n')}` : null;
}

function tabela(titulo: string, linhas: { nome: string; valor: number }[]): string | null {
  if (!linhas.length) return null;
  return `${titulo}:\n${linhas.map((l, i) => `${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} ${l.nome} ${l.valor}`).join('\n')}`;
}

/** As três tabelas gerais (cada uma vira uma mensagem); a que ninguém pontuou fica de fora. */
export function tabelasGerais(geral: LinhaRanking[]): string[] {
  const artilharia = ordenarArtilharia(geral).slice(0, TOPO_GERAL);
  const garcons = geral
    .filter((l) => l.assistencias > 0)
    .sort((a, b) => b.assistencias - a.assistencias || b.gols - a.gols || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, TOPO_GERAL);
  const vitorias = geral
    .filter((l) => l.vitorias > 0)
    .sort((a, b) => b.vitorias - a.vitorias || b.pontos - a.pontos || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, TOPO_GERAL);
  return [
    tabela('⚽ Artilharia geral', artilharia.map((l) => ({ nome: l.nome, valor: l.gols }))),
    tabela('🎯 Garçons geral', garcons.map((l) => ({ nome: l.nome, valor: l.assistencias }))),
    tabela('🏆 Vitórias geral', vitorias.map((l) => ({ nome: l.nome, valor: l.vitorias }))),
  ].filter((t): t is string => !!t);
}

/** Todas as mensagens do resumo, na ordem de envio; vazio se a noite não teve nada para contar. */
export function textosDoResumo(hoje: LinhaRanking[], geral: LinhaRanking[]): string[] {
  const noite = textoDaNoite(hoje);
  return noite ? [noite, ...tabelasGerais(geral)] : [];
}
