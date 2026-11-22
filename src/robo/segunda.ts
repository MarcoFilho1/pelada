// A segunda-feira do robô: a que horas sai a primeira lista da semana e, antes dela, o bom dia que
// anima o grupo. Os horários vêm do .env do robô como faixas ("11:00-12:00"); o minuto é sorteado
// dentro da faixa, sempre o mesmo para a mesma semana (reiniciar não muda) e diferente a cada semana.
import { aberturaLista } from '@/domain/tempo';

/** Faixa em minutos depois da meia-noite de segunda: [início, fim]. */
export type Faixa = [number, number];

/** Sem configuração: a lista sai segunda 14:00 e não há bom dia (como sempre foi). */
const PADRAO_LISTA: Faixa = [14 * 60, 14 * 60];

let faixaDaLista: Faixa = PADRAO_LISTA;
let faixaDoBomDia: Faixa | null = null;

/** "11:00-12:00" → [660, 720]; vazio ou inválido → null. */
export function lerFaixa(texto: string | undefined): Faixa | null {
  const m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(texto ?? '');
  if (!m) return null;
  const a = Number(m[1]) * 60 + Number(m[2]);
  const b = Number(m[3]) * 60 + Number(m[4]);
  return a <= b && b < 24 * 60 ? [a, b] : null;
}

/** Lê `ROBO_LISTA_HORARIO` e `ROBO_BOM_DIA_HORARIO` (chamado uma vez, no início do robô). */
export function configurarSegunda(env: Record<string, string | undefined>): void {
  faixaDaLista = lerFaixa(env.ROBO_LISTA_HORARIO) ?? PADRAO_LISTA;
  faixaDoBomDia = lerFaixa(env.ROBO_BOM_DIA_HORARIO);
}

/** Um número estável por semana (para sortear minuto e texto). */
function semente(texto: string): number {
  let h = 2166136261;
  for (const c of texto) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function naFaixa(dataQuarta: string, f: Faixa, sal: string): Date {
  const minutos = f[0] + (semente(dataQuarta + sal) % (f[1] - f[0] + 1));
  return new Date(aberturaLista(dataQuarta).getTime() + minutos * 60_000);
}

/** Quando sai a primeira lista da semana da quarta `dataQuarta`. */
export function horaDaLista(dataQuarta: string): Date {
  return naFaixa(dataQuarta, faixaDaLista, 'lista');
}

/** Quando sai o bom dia de segunda; `null` sem bom dia configurado. */
export function horaDoBomDia(dataQuarta: string): Date | null {
  return faixaDoBomDia ? naFaixa(dataQuarta, faixaDoBomDia, 'bom dia') : null;
}

/** Onde a semana do robô começa: o primeiro dos dois (bom dia ou lista). */
export function inicioDaSemana(dataQuarta: string): Date {
  const bomDia = horaDoBomDia(dataQuarta);
  const lista = horaDaLista(dataQuarta);
  return bomDia && bomDia < lista ? bomDia : lista;
}

const BONS_DIAS = [
  ['Bom dia, galera ⚽', 'Semana de pelada começando', 'Daqui a pouco mando a lista aqui pra gente organizar a de quarta'],
  ['Bom dia, pessoal', 'Quarta tem pelada, hein', 'Jajá a lista sai aqui no grupo, fiquem de olho'],
  ['Fala, galera, bom dia', 'Bora que quarta tem jogo', 'Mais tarde mando a lista pra organizar a pelada da semana'],
  ['Bom dia, boleiros', 'Já tão com a chuteira separada pra quarta?', 'Daqui a pouco a lista sai aqui no grupo'],
];

/** O bom dia da semana (um texto por semana, em mensagens curtas separadas por linha em branco). */
export function textoDoBomDia(dataQuarta: string): string {
  return BONS_DIAS[semente(dataQuarta + 'texto') % BONS_DIAS.length].join('\n\n');
}

/** Hora de mandar o bom dia: depois da hora dele, antes da lista, e ainda não mandado nesta semana. */
export function horaDeMandarBomDia(now: Date, dataQuarta: string, enviado: string | null | undefined): boolean {
  const h = horaDoBomDia(dataQuarta);
  return !!h && enviado !== dataQuarta && now >= h && now < horaDaLista(dataQuarta);
}
