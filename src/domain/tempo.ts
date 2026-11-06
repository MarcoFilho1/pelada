// Pelada sem horário de verão: Recife é sempre UTC-03:00.
const OFFSET_RECIFE_MS = -3 * 60 * 60 * 1000;

/** Mês ('YYYY-MM') da data no fuso de Recife. */
export function mesDe(data: Date): string {
  return new Date(data.getTime() + OFFSET_RECIFE_MS).toISOString().slice(0, 7);
}

/** Dia ('YYYY-MM-DD') do instante no fuso de Recife. */
export function dataDe(instante: Date): string {
  return new Date(instante.getTime() + OFFSET_RECIFE_MS).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' → 'DD/MM'. */
export function diaMes(data: string): string {
  const [, mes, dia] = data.split('-');
  return `${dia}/${mes}`;
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 'YYYY-MM' → 'novembro de 2026' (minúsculo, como no meio da frase). */
export function nomeDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Dia da semana e data do instante em Recife: 'segunda, 09/11'. */
export function diaDaSemana(instante: Date): string {
  const local = new Date(instante.getTime() + OFFSET_RECIFE_MS);
  return `${DIAS[local.getUTCDay()]}, ${diaMes(dataDe(instante))}`;
}

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
const QUARTA = 3; // Date#getUTCDay

/** Vagas da lista principal (4 times de 4). */
export const VAGAS = 16;
/** Máximo de mensalistas por mês. */
export const MAX_MENSALISTAS = 16;

/** Mês ('YYYY-MM') da quarta `'YYYY-MM-DD'`. */
export function mesDaQuarta(dataQuarta: string): string {
  return mesDe(new Date(`${dataQuarta}T12:00:00-03:00`));
}

/** Instante da `dataQuarta` às hh:mm de Recife, `dias` dias depois (ou antes, se negativo). */
function naQuarta(dataQuarta: string, hora: string, dias = 0): Date {
  const base = new Date(`${dataQuarta}T${hora}-03:00`);
  return new Date(base.getTime() + dias * DIA_MS);
}

/** Data ('YYYY-MM-DD') da quarta desta semana; depois de quarta 22:30 (fim do jogo) passa para a seguinte. */
export function proximaQuarta(now: Date): string {
  const local = new Date(now.getTime() + OFFSET_RECIFE_MS);
  let falta = (QUARTA - local.getUTCDay() + 7) % 7;
  if (falta === 0) {
    const minutos = local.getUTCHours() * 60 + local.getUTCMinutes();
    if (minutos >= 22 * 60 + 30) falta = 7;
  }
  return new Date(local.getTime() + falta * DIA_MS).toISOString().slice(0, 10);
}

/** Segunda 00:00 (Recife) da semana da quarta. */
export function aberturaLista(dataQuarta: string): Date {
  return naQuarta(dataQuarta, '00:00:00', -2);
}

/** Quarta 14:00 (Recife). */
export function prazoMensalista(dataQuarta: string): Date {
  return naQuarta(dataQuarta, '14:00:00');
}

/** Quarta 20:30 (Recife). */
export function inicioJogo(dataQuarta: string): Date {
  return naQuarta(dataQuarta, '20:30:00');
}

/** Fim do jogo: quarta 22:30 (Recife). */
export function fimJogo(dataQuarta: string): Date {
  return new Date(inicioJogo(dataQuarta).getTime() + 2 * HORA_MS);
}
