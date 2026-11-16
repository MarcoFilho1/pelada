import { desc, lte } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { peladas } from '@/db/schema';
import { previaDosTimes, TAM_MAX_TEXTO_COLADO, type Previa } from '@/domain/importarTimes';
import { CORES, diferenca, formatarNota, sortearDaNoite, type QtdDeTimes, type TimeSorteado } from '@/domain/sorteio';
import { dataDe } from '@/domain/tempo';
import { mensagemParaUsuario } from '@/server/erros';
import { listarJogadores } from '@/server/jogadores';
import { participantesPadrao, salvarTimesDefinitivos } from '@/server/times';

export const TEXTO_SO_ADMIN = '🔐 Só os organizadores podem sortear pelo WhatsApp.';

/** A proposta vale por 60 minutos (ou até outra a substituir). */
export const VALIDADE_MS = 60 * 60_000;
/** Os times valem com 2 dos 3 organizadores (quem propôs também confirma). */
export const VOTOS_NECESSARIOS = 2;

/** Times propostos (sorteados ou importados) esperando os votos dos organizadores. */
export type Proposta = {
  origem: 'sorteio' | 'importado';
  /** Telefone e nome do WhatsApp de quem propôs (o nome vai nas mensagens; o telefone, nunca). */
  quemPropos: string;
  quemProposNome: string;
  criadaEm: Date;
  peladaId: number;
  /** Ids dos jogadores por time, na ordem das cores. */
  elencos: number[][];
  /** Notas dos COMPLETE de cada time, alinhadas com `elencos`. */
  completes: number[][];
  /** Os times com as notas, a soma de cada um e a diferença (vai na proposta e no anúncio do grupo). */
  blocos: string;
  /** O texto mostrado a quem propôs e aos outros organizadores. */
  texto: string;
  /** Telefones de quem já confirmou (sem repetir). */
  votos: string[];
};

/** O que o banco devolve para montar uma proposta: os times já com nomes e notas. */
export type TimesPropostos = { peladaId: number; times: TimeSorteado[] };

/** Forma única do número: só dígitos, sem 55 e sem o 9 extra do celular depois do DDD. */
function canonico(telefone: string): string {
  let d = telefone.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  return d.length === 10 ? d : '';
}

/**
 * Quem manda vem do WhatsApp com código do país (12 ou 13 dígitos começando com 55); sem isso o DDD 81
 * se confundiria com o +81 do Japão. A tolerância (sem 55, sem o 9) vale só para o cadastro dos admins.
 */
function canonicoRemetente(telefone: string): string {
  const d = telefone.replace(/\D/g, '');
  return /^55\d{10,11}$/.test(d) ? canonico(d) : '';
}

export function ehAdmin(telefone: string, admins: string[]): boolean {
  const t = canonicoRemetente(telefone);
  return t !== '' && admins.some((a) => canonico(a) === t);
}

/** Textos de erro do site que mandam recarregar a página viram algo que faz sentido no WhatsApp. */
export function paraWhatsApp(texto: string): string {
  return `⚠️ ${texto.replace(/Recarregue a página\./g, 'Tente de novo.')}`;
}

export const EMOJI_COR: Record<string, string> = { azul: '🔵', laranja: '🟠', verde: '🟢', preto: '⚫' };
const maiuscula = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Os times com notas, a soma de cada um e a diferença; igual na proposta e no anúncio do grupo. */
export function blocosDosTimes(times: TimeSorteado[]): string {
  const blocos = times.map((t, i) =>
    [
      `${EMOJI_COR[CORES[i]]} ${maiuscula(CORES[i])} (${formatarNota(t.soma)})`,
      ...t.jogadores.map((j) => `- ${j.nome} ${formatarNota(j.nota)}`),
      ...t.completes.map((n) => `- COMPLETE ${formatarNota(n)}`),
    ].join('\n'),
  );
  return `${blocos.join('\n\n')}\n\nDiferença: ${formatarNota(diferenca(times))}`;
}

export const INSTRUCOES_VOTO =
  '✅ Responda *sim* para confirmar. Os times valem quando 2 dos 3 organizadores confirmarem (quem propôs também confirma). A proposta vale por 60 minutos; *sortear* de novo troca a proposta.';

/** Monta a proposta (sem votos) a partir dos times já com nomes e notas. */
export function montarProposta(
  origem: Proposta['origem'],
  quem: { telefone: string; nome: string },
  now: Date,
  t: TimesPropostos,
): Proposta {
  const blocos = blocosDosTimes(t.times);
  const titulo = origem === 'sorteio' ? `🎲 Times sorteados por ${quem.nome}:` : `📥 Times importados por ${quem.nome}:`;
  return {
    origem,
    quemPropos: quem.telefone,
    quemProposNome: quem.nome,
    criadaEm: now,
    peladaId: t.peladaId,
    elencos: t.times.map((x) => x.jogadores.map((j) => j.id)),
    completes: t.times.map((x) => x.completes),
    blocos,
    texto: `${titulo}\n\n${blocos}\n\n${INSTRUCOES_VOTO}`,
    votos: [],
  };
}

export const propostaVencida = (p: Proposta, now: Date) => now.getTime() - p.criadaEm.getTime() >= VALIDADE_MS;

export type ResultadoDoVoto = { tipo: 'vencida' } | { tipo: 'ja_votou'; faltam: number } | { tipo: 'contou'; faltam: number } | { tipo: 'fechou' };

/** Um voto de organizador (o telefone já conferido). Pura: devolve a proposta com o voto e o resultado. */
export function votar(p: Proposta, telefone: string, now: Date): { proposta: Proposta; resultado: ResultadoDoVoto } {
  if (propostaVencida(p, now)) return { proposta: p, resultado: { tipo: 'vencida' } };
  const faltam = (votos: string[]) => Math.max(0, VOTOS_NECESSARIOS - votos.length);
  if (p.votos.some((v) => ehAdmin(telefone, [v]))) return { proposta: p, resultado: { tipo: 'ja_votou', faltam: faltam(p.votos) } };
  const votos = [...p.votos, telefone];
  const proposta = { ...p, votos };
  return { proposta, resultado: faltam(votos) === 0 ? { tipo: 'fechou' } : { tipo: 'contou', faltam: faltam(votos) } };
}

/** A pelada de hoje (só lê): o `peladaDoDia` do site cria a da quarta e, nos outros dias, devolve a última. */
async function peladaDeHoje(db: DB, now: Date): Promise<{ id: number } | null> {
  const hoje = dataDe(now);
  const [p] = await db.select().from(peladas).where(lte(peladas.data, hoje)).orderBy(desc(peladas.data)).limit(1);
  return p && p.data === hoje ? p : null;
}

export const TEXTO_SEM_PELADA_HOJE = '📅 Hoje não tem pelada para sortear.';

/**
 * Sorteia os times da noite (mesma regra do site: `times` times, cada um completado com COMPLETE até 4) sem gravar
 * nada. A quantidade fica nos próprios times, então o que for confirmado é o que foi mostrado.
 */
export async function sortearTimesDaNoite(
  db: DB,
  now: Date,
  rng: () => number = Math.random,
  times: QtdDeTimes = 4,
): Promise<TimesPropostos | { erro: string }> {
  const p = await peladaDeHoje(db, now);
  if (!p) return { erro: TEXTO_SEM_PELADA_HOJE };
  const participantes = await participantesPadrao(db, p.id, now);
  if (participantes.length < 2) return { erro: '👥 Poucos confirmados para sortear.' };
  return { peladaId: p.id, times: sortearDaNoite(participantes, times, rng) };
}

/** Texto do "não deu para importar": cada nome com problema e o que fazer. */
function problemasDaPrevia(previa: Previa): string {
  const linhas: string[] = [];
  for (const n of previa.times.flatMap((t) => t.nomes)) {
    if (n.tipo === 'nao_achei') linhas.push(`- "${n.escrito}": não achei${n.sugestao ? `. Você quis dizer ${n.sugestao}?` : '.'}`);
    else if (n.tipo === 'varios') linhas.push(`- "${n.escrito}": serve para ${n.opcoes.join(', ')}. Mande o nome inteiro.`);
    else if (n.repetido) linhas.push(`- ${n.jogador.nome} aparece mais de uma vez.`);
  }
  return `🤔 Não deu para importar:\n${[...new Set(linhas)].join('\n')}\nCorrija e mande *importar* com os times de novo.`;
}

/** Os times colados (o formato do "Importar times" do site), com os nomes casados aos jogadores ativos. Não grava nada. */
export async function importarTimesColados(db: DB, now: Date, texto: string): Promise<TimesPropostos | { erro: string }> {
  const p = await peladaDeHoje(db, now);
  if (!p) return { erro: '📅 Hoje não tem pelada para importar times.' };
  if (texto.length > TAM_MAX_TEXTO_COLADO) return { erro: '🤔 Texto grande demais para importar.' };
  const ativos = (await listarJogadores(db, { incluirInativos: false })).map((j) => ({ id: j.id, nome: j.nome, nota: j.nota }));
  const r = previaDosTimes(texto, ativos);
  if (!r.ok) return { erro: `🤔 ${r.erro}` };
  if (!r.previa.pronto) return { erro: problemasDaPrevia(r.previa) };
  const times = r.previa.times.map((t) => {
    const jogadores = t.nomes.flatMap((n) => (n.tipo === 'ok' ? [n.jogador] : []));
    return { jogadores, completes: t.completes, soma: [...jogadores.map((j) => j.nota), ...t.completes].reduce((a, b) => a + b, 0) };
  });
  return { peladaId: p.id, times };
}

/**
 * Grava a proposta como times definitivos, pelo caminho do site. No sorteio, recusa se a lista mudou desde
 * a proposta (os times não batem com quem vai jogar). As outras recusas são as do site.
 */
export async function salvarProposta(db: DB, now: Date, proposta: Proposta): Promise<{ ok: true } | { erro: string }> {
  try {
    if (proposta.origem === 'sorteio') {
      const hoje = new Set((await participantesPadrao(db, proposta.peladaId, now)).map((j) => j.id));
      const propostos = proposta.elencos.flat();
      if (hoje.size !== propostos.length || !propostos.every((id) => hoje.has(id))) {
        return { erro: '🔄 A lista mudou desde o sorteio. Peça *sortear* de novo.' };
      }
    }
    await salvarTimesDefinitivos(db, proposta.peladaId, proposta.elencos, proposta.completes, now);
  } catch (e) {
    return { erro: paraWhatsApp(mensagemParaUsuario(e)) };
  }
  return { ok: true };
}

/** A proposta como vai no `estado.json` (a data em texto). */
export type PropostaGuardada = Omit<Proposta, 'criadaEm'> & { criadaEm: string };

export const paraGuardar = (p: Proposta | null): PropostaGuardada | null => (p ? { ...p, criadaEm: p.criadaEm.toISOString() } : null);

/** Do `estado.json` de volta; qualquer coisa fora do formato vira `null` (o robô segue sem proposta). */
export function deGuardada(x: unknown): Proposta | null {
  if (!x || typeof x !== 'object') return null;
  const g = x as Partial<PropostaGuardada>;
  const listaDeListas = (v: unknown) => Array.isArray(v) && v.every((l) => Array.isArray(l) && l.every((n) => typeof n === 'number'));
  const criadaEm = new Date(g.criadaEm ?? '');
  if (
    (g.origem !== 'sorteio' && g.origem !== 'importado') ||
    typeof g.quemPropos !== 'string' ||
    typeof g.quemProposNome !== 'string' ||
    Number.isNaN(criadaEm.getTime()) ||
    typeof g.peladaId !== 'number' ||
    !listaDeListas(g.elencos) ||
    !listaDeListas(g.completes) ||
    typeof g.blocos !== 'string' ||
    typeof g.texto !== 'string' ||
    !Array.isArray(g.votos) ||
    !g.votos.every((v) => typeof v === 'string')
  ) {
    return null;
  }
  return { ...(g as PropostaGuardada), criadaEm };
}
