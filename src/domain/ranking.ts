import type { Cor } from './sorteio';

export type PartidaEncerrada = {
  id: number;
  peladaData: string;
  encerradaEm: Date;
  resultado: 'A' | 'B' | 'empate';
  /** Cor do colete de cada lado. */
  corA: Cor;
  corB: Cor;
  elenco: { jogadorId: number; lado: 'A' | 'B' }[];
  lances: { jogadorId: number; tipo: 'gol' | 'assistencia' }[];
};

export type Periodo = { tipo: 'geral' } | { tipo: 'ano'; ano: number } | { tipo: 'mes'; ano: number; mes: number };

export type LinhaRanking = {
  jogadorId: number;
  nome: string;
  pontos: number;
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  aproveitamento: number;
  gols: number;
  assistencias: number;
  golsPorJogo: number;
  presencas: number;
};

/** Linha do ranking com a nota do jogador (notas são públicas). */
export type LinhaRankingComNota = LinhaRanking & { nota: number };

/** Uma partida do ponto de vista do jogador: o time dele primeiro. */
export type PartidaDoJogador = {
  partidaId: number;
  corDoTime: Cor;
  corAdversario: Cor;
  placarTime: number;
  placarAdversario: number;
  resultado: 'V' | 'E' | 'D';
  gols: number;
  assistencias: number;
};

export type QuartaDoJogador = {
  peladaData: string;
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  gols: number;
  assistencias: number;
  /** Partidas da noite, da primeira para a última. */
  partidas: PartidaDoJogador[];
};

/** Pontuação: vitória 3, empate 1, gol 1, assistência 1. */
export function pontosDe(n: { vitorias: number; empates: number; gols: number; assistencias: number }): number {
  return 3 * n.vitorias + n.empates + n.gols + n.assistencias;
}

/** Prefixo 'YYYY' / 'YYYY-MM' das datas de pelada do período; '' para o geral. */
export function prefixoDoPeriodo(periodo: Periodo): string {
  if (periodo.tipo === 'geral') return '';
  const ano = String(periodo.ano).padStart(4, '0');
  if (periodo.tipo === 'ano') return ano;
  return `${ano}-${String(periodo.mes).padStart(2, '0')}`;
}

/** Só as partidas cuja quarta (data da pelada, não `encerradaEm`) cai no período. */
export function filtrarPeriodo(partidas: PartidaEncerrada[], periodo: Periodo): PartidaEncerrada[] {
  const prefixo = prefixoDoPeriodo(periodo);
  return partidas.filter((p) => p.peladaData.startsWith(prefixo));
}

type Acumulo = Omit<LinhaRanking, 'nome' | 'pontos' | 'aproveitamento' | 'golsPorJogo' | 'presencas'> & { quartas: Set<string> };

const arredonda = (n: number, casas: number) => Number(n.toFixed(casas));

/** Resultado do jogador na partida e seus gols/assistências (só vale para quem estava no elenco). */
function desempenho(p: PartidaEncerrada, jogadorId: number, lado: 'A' | 'B') {
  const venceu = p.resultado === lado;
  const empatou = p.resultado === 'empate';
  let gols = 0;
  let assistencias = 0;
  for (const l of p.lances) {
    if (l.jogadorId !== jogadorId) continue;
    if (l.tipo === 'gol') gols++;
    else assistencias++;
  }
  return { vitoria: venceu ? 1 : 0, empate: empatou ? 1 : 0, derrota: !venceu && !empatou ? 1 : 0, gols, assistencias };
}

function ordenar(a: LinhaRanking, b: LinhaRanking): number {
  return (
    b.pontos - a.pontos ||
    b.vitorias - a.vitorias ||
    b.gols - a.gols ||
    a.jogos - b.jogos ||
    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
  );
}

/** Ranking do período, derivado das partidas encerradas. Só lista quem jogou ao menos uma partida. */
export function calcularRanking(partidas: PartidaEncerrada[], nomes: Map<number, string>, periodo: Periodo): LinhaRanking[] {
  const acc = new Map<number, Acumulo>();
  for (const p of filtrarPeriodo(partidas, periodo)) {
    for (const { jogadorId, lado } of p.elenco) {
      const d = desempenho(p, jogadorId, lado);
      let a = acc.get(jogadorId);
      if (!a) {
        a = { jogadorId, jogos: 0, vitorias: 0, empates: 0, derrotas: 0, gols: 0, assistencias: 0, quartas: new Set() };
        acc.set(jogadorId, a);
      }
      a.jogos++;
      a.vitorias += d.vitoria;
      a.empates += d.empate;
      a.derrotas += d.derrota;
      a.gols += d.gols;
      a.assistencias += d.assistencias;
      a.quartas.add(p.peladaData);
    }
  }
  const linhas = [...acc.values()].map(({ quartas, ...a }): LinhaRanking => {
    const pontos = pontosDe(a);
    return {
      ...a,
      nome: nomes.get(a.jogadorId) ?? `Jogador ${a.jogadorId}`,
      pontos,
      aproveitamento: a.jogos ? arredonda(((3 * a.vitorias + a.empates) / (3 * a.jogos)) * 100, 1) : 0,
      golsPorJogo: a.jogos ? arredonda(a.gols / a.jogos, 2) : 0,
      presencas: quartas.size,
    };
  });
  return linhas.sort(ordenar);
}

/** Destaques do período; omite o que ninguém fez. Empate no máximo: quem vem antes no ranking. */
export function destaques(linhas: LinhaRanking[]): { artilheiro?: LinhaRanking; garcom?: LinhaRanking; maisVitorias?: LinhaRanking } {
  const melhor = (campo: 'gols' | 'assistencias' | 'vitorias') => {
    let top: LinhaRanking | undefined;
    for (const l of linhas) if (l[campo] > 0 && (!top || l[campo] > top[campo])) top = l;
    return top;
  };
  const out: { artilheiro?: LinhaRanking; garcom?: LinhaRanking; maisVitorias?: LinhaRanking } = {};
  const artilheiro = melhor('gols');
  const garcom = melhor('assistencias');
  const maisVitorias = melhor('vitorias');
  if (artilheiro) out.artilheiro = artilheiro;
  if (garcom) out.garcom = garcom;
  if (maisVitorias) out.maisVitorias = maisVitorias;
  return out;
}

/** Gols do lado: soma dos gols de quem estava no elenco daquele lado (sem gol contra). */
function placarDoLado(p: PartidaEncerrada, lado: 'A' | 'B'): number {
  const doLado = new Set(p.elenco.filter((e) => e.lado === lado).map((e) => e.jogadorId));
  return p.lances.filter((l) => l.tipo === 'gol' && doLado.has(l.jogadorId)).length;
}

/**
 * Uma linha por quarta em que o jogador jogou (nas partidas dadas), mais recente primeiro,
 * com as partidas da noite em ordem (a primeira encerrada primeiro).
 */
export function historicoDoJogador(partidas: PartidaEncerrada[], jogadorId: number): QuartaDoJogador[] {
  const porQuarta = new Map<string, QuartaDoJogador>();
  const emOrdem = [...partidas].sort((a, b) => a.encerradaEm.getTime() - b.encerradaEm.getTime() || a.id - b.id);
  for (const p of emOrdem) {
    const no = p.elenco.find((e) => e.jogadorId === jogadorId);
    if (!no) continue;
    const d = desempenho(p, jogadorId, no.lado);
    let q = porQuarta.get(p.peladaData);
    if (!q) {
      q = { peladaData: p.peladaData, jogos: 0, vitorias: 0, empates: 0, derrotas: 0, gols: 0, assistencias: 0, partidas: [] };
      porQuarta.set(p.peladaData, q);
    }
    q.jogos++;
    q.vitorias += d.vitoria;
    q.empates += d.empate;
    q.derrotas += d.derrota;
    q.gols += d.gols;
    q.assistencias += d.assistencias;
    const outro = no.lado === 'A' ? 'B' : 'A';
    q.partidas.push({
      partidaId: p.id,
      corDoTime: no.lado === 'A' ? p.corA : p.corB,
      corAdversario: no.lado === 'A' ? p.corB : p.corA,
      placarTime: placarDoLado(p, no.lado),
      placarAdversario: placarDoLado(p, outro),
      resultado: d.vitoria ? 'V' : d.empate ? 'E' : 'D',
      gols: d.gols,
      assistencias: d.assistencias,
    });
  }
  return [...porQuarta.values()].sort((a, b) => b.peladaData.localeCompare(a.peladaData));
}
