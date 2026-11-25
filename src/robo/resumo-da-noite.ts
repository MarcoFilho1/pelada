// O resumo do fim da pelada, no grupo: os destaques da noite numa mensagem e, depois, a tabela
// geral (artilharia, garçons, vitórias), cada uma na sua mensagem (como gente mandando, não um
// bloco só). Sai uma vez por noite, entre 22:35 e 22:40, quando nenhuma partida está em andamento.
// Se não deu para mandar até as 23:30 (o celular do robô ficou sem internet, ou a anotação feita no
// app ainda não chegou ao banco), sai na manhã seguinte, entre 8h e meio-dia, como "ontem".
import type { LinhaRanking } from '@/domain/ranking';
import { dataDe } from '@/domain/tempo';
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

/** Até quando as mensagens do fim da noite (resumo, lembrete do Pix) ainda saem: 23:30 de Recife. */
export function fimDaNoite(data: string): Date {
  return new Date(Date.parse(`${data}T23:30:00Z`) - OFFSET_RECIFE_MS);
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** A manhã seguinte à noite `data`, quando sai o que não saiu à noite: das 8h ao meio-dia de Recife. */
export function manhaSeguinte(data: string): { de: Date; ate: Date } {
  const zero = Date.parse(`${data}T00:00:00Z`) - OFFSET_RECIFE_MS + DIA_MS;
  return { de: new Date(zero + 8 * 60 * 60 * 1000), ate: new Date(zero + 12 * 60 * 60 * 1000) };
}

/** A mensagem do fim da pelada que está na vez: de qual noite é, se sai como "ontem" e até quando pode sair. */
export type Vez = { data: string; ontem: boolean; ate: Date };

/**
 * Qual fim de pelada tentar agora (vale para o resumo e para o lembrete do Pix; `enviado` = data do
 * último mandado). À noite, o de hoje: depois da hora do resumo e antes das 23:30. De manhã (8h ao
 * meio-dia), o de ontem, se não saiu. `desde`: quando este robô começou a guardar estado; a noite
 * de antes disso não é dele (um robô recém-instalado não repete o resumo que outro já mandou).
 */
export function fimDePeladaDaVez(now: Date, enviado: string | null | undefined, desde: string | null | undefined): Vez | null {
  const hoje = dataDe(now);
  if (enviado !== hoje && now >= horaDoResumo(hoje) && now < fimDaNoite(hoje)) return { data: hoje, ontem: false, ate: fimDaNoite(hoje) };
  const ontem = dataDe(new Date(now.getTime() - DIA_MS));
  const manha = manhaSeguinte(ontem);
  const eraDele = !!desde && new Date(desde) < horaDoResumo(ontem);
  if (now >= manha.de && now < manha.ate && (enviado ?? '') < ontem && eraDele) return { data: ontem, ontem: true, ate: manha.ate };
  return null;
}

/** Desde quando o resumo para de esperar uma partida aberta (alguém esqueceu de encerrar): 22:55. */
export function paraDeEsperar(data: string): Date {
  return new Date(Date.parse(`${data}T22:55:00Z`) - OFFSET_RECIFE_MS);
}

/**
 * Se agora é hora de tentar o resumo (ou o lembrete) de hoje: depois da hora do resumo, antes das
 * 23:30 (um resumo que começou 23:12 ainda termina), e ainda não mandado (`enviado` = data do último).
 */
export function horaDeTentarResumo(now: Date, enviado: string | null | undefined): boolean {
  const hoje = dataDe(now);
  return enviado !== hoje && now >= horaDoResumo(hoje) && now < fimDaNoite(hoje);
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

/** A mensagem dos destaques da noite; `null` se ninguém fez gol, assistência nem venceu. `ontem`: sai na manhã seguinte. */
export function textoDaNoite(hoje: LinhaRanking[], ontem = false): string | null {
  const art = melhores(hoje, 'gols');
  const gar = melhores(hoje, 'assistencias');
  const vit = melhores(hoje, 'vitorias');
  const linhas = [
    art && `⚽ Artilheiro: ${nomes(art.nomes)} (${plural(art.valor, 'gol', 'gols')})`,
    gar && `🎯 Garçom: ${nomes(gar.nomes)} (${plural(gar.valor, 'assistência', 'assistências')})`,
    vit && `🏆 Mais vitórias: ${nomes(vit.nomes)} (${plural(vit.valor, 'vitória', 'vitórias')})`,
  ].filter((l): l is string => !!l);
  if (!linhas.length) return null;
  return `${ontem ? '🏁 Destaques da pelada de ontem:' : '🏁 Fim de pelada! Destaques de hoje:'}\n${linhas.join('\n')}`;
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
export function textosDoResumo(hoje: LinhaRanking[], geral: LinhaRanking[], ontem = false): string[] {
  const noite = textoDaNoite(hoje, ontem);
  return noite ? [noite, ...tabelasGerais(geral)] : [];
}
