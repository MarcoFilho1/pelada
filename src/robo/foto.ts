import type { ItemLista } from '@/domain/lista';
import type { EstadoDaSemana } from '@/server/presencas';

export type Onde = 'confirmado' | 'pendente' | 'fila' | 'prazo';

export type FotoDaLista = {
  dataQuarta: string;
  estadoManual: 'aberta' | 'fechada' | 'cancelada' | null;
  jogadores: Record<number, { nome: string; onde: Onde; tipo: 'M' | 'D' }>;
};

export type Mudancas = {
  confirmaram: string[];
  sairam: string[];
  entraramNaLista: string[];
  subiramDaFila: string[];
  entraramNaFila: string[];
  perderamPrazo: string[];
  manual: 'fechou' | 'reabriu' | null;
};

/** Foto da lista de agora: quem está onde, por `jogadorId`. Pura, sem banco. */
export function fotografar(estado: EstadoDaSemana): FotoDaLista {
  const jogadores: FotoDaLista['jogadores'] = {};
  const por = (itens: ItemLista[], onde: (i: ItemLista) => Onde) => {
    for (const i of itens) jogadores[i.jogadorId] = { nome: i.nome, onde: onde(i), tipo: i.tipo };
  };
  por(estado.foraDoPrazo, () => 'prazo');
  por(estado.fila, () => 'fila');
  por(estado.principal, (i) => (i.confirmado ? 'confirmado' : 'pendente'));
  return { dataQuarta: estado.data, estadoManual: estado.estadoManual, jogadores };
}

const naLista = (o: Onde | undefined) => o === 'confirmado' || o === 'pendente';
const estava = (o: Onde | undefined) => naLista(o) || o === 'fila';
const alfabetica = (nomes: string[]) => [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));

/** Diferença líquida entre duas fotos (não é histórico): quem confirma e sai no intervalo só "saiu". */
export function mudancas(antes: FotoDaLista, depois: FotoDaLista): Mudancas {
  const r = {
    confirmaram: [] as string[],
    sairam: [] as string[],
    entraramNaLista: [] as string[],
    subiramDaFila: [] as string[],
    entraramNaFila: [] as string[],
    perderamPrazo: [] as string[],
  };
  const ids = new Set([...Object.keys(antes.jogadores), ...Object.keys(depois.jogadores)].map(Number));
  for (const id of ids) {
    const a = antes.jogadores[id];
    const d = depois.jogadores[id];
    if (!d) {
      if (estava(a?.onde)) r.sairam.push(a.nome);
      continue;
    }
    if (d.onde === 'prazo') {
      if (a?.onde !== 'prazo') r.perderamPrazo.push(d.nome);
    } else if (d.onde === 'confirmado') {
      if (a?.onde === 'pendente') r.confirmaram.push(d.nome);
      else if (a?.onde === 'fila') r.subiramDaFila.push(d.nome);
      else if (!naLista(a?.onde)) r.entraramNaLista.push(d.nome);
    } else if (d.onde === 'pendente') {
      if (a?.onde === 'fila') r.subiramDaFila.push(d.nome);
      else if (!naLista(a?.onde)) r.entraramNaLista.push(d.nome);
    } else if (d.onde === 'fila' && !estava(a?.onde)) {
      r.entraramNaFila.push(d.nome);
    }
  }
  let manual: Mudancas['manual'] = null;
  if (depois.estadoManual === 'fechada' && antes.estadoManual !== 'fechada') manual = 'fechou';
  else if (antes.estadoManual === 'fechada' && (depois.estadoManual === null || depois.estadoManual === 'aberta')) manual = 'reabriu';
  return {
    confirmaram: alfabetica(r.confirmaram),
    sairam: alfabetica(r.sairam),
    entraramNaLista: alfabetica(r.entraramNaLista),
    subiramDaFila: alfabetica(r.subiramDaFila),
    entraramNaFila: alfabetica(r.entraramNaFila),
    perderamPrazo: alfabetica(r.perderamPrazo),
    manual,
  };
}

export function haMudanca(m: Mudancas): boolean {
  return (
    m.manual !== null ||
    m.confirmaram.length + m.sairam.length + m.entraramNaLista.length + m.subiramDaFila.length + m.entraramNaFila.length + m.perderamPrazo.length > 0
  );
}

/** "A", "A e B", "A, B e C". */
export function juntarNomes(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

/** Uma linha por tipo que aconteceu, na ordem do desenho. */
export function linhasDoCabecalho(m: Mudancas): string[] {
  const linhas: string[] = [];
  const add = (rotulo: string, nomes: string[]) => {
    if (nomes.length) linhas.push(`${rotulo}: ${juntarNomes(nomes)}.`);
  };
  add('Confirmaram', m.confirmaram);
  add('Saíram', m.sairam);
  add('Entraram na lista', m.entraramNaLista);
  add('Subiram da fila', m.subiramDaFila);
  add('Entraram na fila', m.entraramNaFila);
  add('Perderam o prazo', m.perderamPrazo);
  if (m.manual === 'fechou') linhas.push('O admin fechou a lista.');
  if (m.manual === 'reabriu') linhas.push('O admin reabriu a lista.');
  return linhas;
}
