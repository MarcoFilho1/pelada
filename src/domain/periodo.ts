import type { Periodo } from './ranking';
import { mesDe, nomeDoMes } from './tempo';

/** Anos e meses ('YYYY-MM') com partida encerrada, mais recentes primeiro (`periodosDisponiveis`). */
export type PeriodosDisponiveis = { anos: number[]; meses: string[] };

export type Aba = Periodo['tipo'];

const doMes = (yyyymm: string): Periodo => ({ tipo: 'mes', ano: Number(yyyymm.slice(0, 4)), mes: Number(yyyymm.slice(5, 7)) });

/** Valor de `?p=` na URL: 'geral', '2026' ou '2026-11'. */
export function parametroDoPeriodo(p: Periodo): string {
  if (p.tipo === 'geral') return 'geral';
  if (p.tipo === 'ano') return String(p.ano);
  return `${p.ano}-${String(p.mes).padStart(2, '0')}`;
}

/** O mês atual em Recife, se já teve partida encerrada nele; senão o geral. */
export function periodoPadrao(now: Date, disp: PeriodosDisponiveis): Periodo {
  const atual = mesDe(now);
  return disp.meses.includes(atual) ? doMes(atual) : { tipo: 'geral' };
}

/** Período pedido na URL. Formato inválido, repetido ou sem partidas cai no padrão, sem erro. */
export function periodoDaUrl(param: string | string[] | undefined, disp: PeriodosDisponiveis, now: Date): Periodo {
  if (param === 'geral') return { tipo: 'geral' };
  if (typeof param === 'string') {
    if (/^\d{4}$/.test(param) && disp.anos.includes(Number(param))) return { tipo: 'ano', ano: Number(param) };
    if (/^\d{4}-\d{2}$/.test(param) && disp.meses.includes(param)) return doMes(param);
  }
  return periodoPadrao(now, disp);
}

/** 'Geral', '2026', 'Novembro de 2026'. */
export function nomeDoPeriodo(p: Periodo): string {
  if (p.tipo === 'geral') return 'Geral';
  if (p.tipo === 'ano') return String(p.ano);
  const nome = nomeDoMes(parametroDoPeriodo(p));
  return nome[0].toUpperCase() + nome.slice(1);
}

/** Ano ou mês disponível logo antes (mais antigo) e logo depois do escolhido. */
export function vizinhos(p: Periodo, disp: PeriodosDisponiveis): { anterior?: Periodo; seguinte?: Periodo } {
  if (p.tipo === 'geral') return {};
  const lista: Periodo[] = p.tipo === 'ano' ? disp.anos.map((ano) => ({ tipo: 'ano', ano })) : disp.meses.map(doMes);
  const i = lista.findIndex((x) => parametroDoPeriodo(x) === parametroDoPeriodo(p));
  if (i < 0) return {};
  const out: { anterior?: Periodo; seguinte?: Periodo } = {};
  if (i + 1 < lista.length) out.anterior = lista[i + 1];
  if (i > 0) out.seguinte = lista[i - 1];
  return out;
}

/**
 * Para onde a aba leva a partir do período escolhido: Ano fica no ano do mês escolhido;
 * Mês vai ao mês mais recente do ano escolhido. `null` quando não há nenhuma partida.
 */
export function alvoDaAba(aba: Aba, atual: Periodo, disp: PeriodosDisponiveis): Periodo | null {
  if (aba === 'geral') return { tipo: 'geral' };
  if (aba === 'ano') {
    if (atual.tipo !== 'geral' && disp.anos.includes(atual.ano)) return { tipo: 'ano', ano: atual.ano };
    return disp.anos.length ? { tipo: 'ano', ano: disp.anos[0] } : null;
  }
  if (atual.tipo === 'mes') return atual;
  const doAno = atual.tipo === 'ano' ? disp.meses.find((m) => m.startsWith(`${atual.ano}-`)) : undefined;
  const mes = doAno ?? disp.meses[0];
  return mes ? doMes(mes) : null;
}
