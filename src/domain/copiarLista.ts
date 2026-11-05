import type { EstadoLista, ItemLista } from './lista';

function linhaPrincipal(numero: number, item: ItemLista | undefined): string {
  if (!item) return `${numero}.`;
  return `${numero}. ${item.nome} (${item.tipo}) ${item.confirmado ? '✅' : '⏳'}`;
}

function linhaFila(numero: number, item: ItemLista): string {
  return `${numero}. ${item.nome}`;
}

/** Texto da lista no formato que o grupo cola no WhatsApp. */
export function textoWhatsApp(estado: EstadoLista, dataQuarta: string): string {
  const [, mes, dia] = dataQuarta.split('-');
  const data = `${dia}/${mes}`;
  const cabecalho = estado.cancelada ? `Pelada ${data} - CANCELADA` : `Pelada ${data} - 20:30-22:30`;

  const principal = Array.from({ length: estado.vagas }, (_, i) =>
    linhaPrincipal(i + 1, estado.principal[i]),
  );
  const fila = estado.fila.length
    ? estado.fila.map((item, i) => linhaFila(i + 1, item))
    : ['1.'];

  return [cabecalho, '', ...principal, '', 'Interessados pra diarista', ...fila].join('\n');
}
