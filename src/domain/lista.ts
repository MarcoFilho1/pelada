import { aberturaLista, fimJogo, inicioJogo, prazoMensalista, VAGAS } from './tempo';

export type EstadoManual = 'aberta' | 'fechada' | 'cancelada' | null;

export type Presenca = {
  id: number;
  jogadorId: number;
  nome: string;
  tipo: 'M' | 'D';
  status: 'pendente' | 'confirmado' | 'removido';
  entrouEm: Date;
};
export type ItemLista = { jogadorId: number; nome: string; tipo: 'M' | 'D'; confirmado: boolean };
export type EstadoLista = {
  aberta: boolean;
  cancelada: boolean;
  principal: ItemLista[];
  fila: ItemLista[];
  vagas: number;
};

function porChegada(a: Presenca, b: Presenca): number {
  return a.entrouEm.getTime() - b.entrouEm.getTime() || a.id - b.id;
}

function item(p: Presenca): ItemLista {
  return { jogadorId: p.jogadorId, nome: p.nome, tipo: p.tipo, confirmado: p.status === 'confirmado' };
}

export function calcularLista(input: {
  presencas: Presenca[];
  dataQuarta: string;
  estadoManual: EstadoManual;
  now: Date;
  vagas?: number;
}): EstadoLista {
  const { presencas, dataQuarta, estadoManual, now } = input;
  const vagas = input.vagas ?? VAGAS;
  const prazo = prazoMensalista(dataQuarta).getTime();
  const vivas = presencas.filter((p) => p.status !== 'removido');
  const mensalistas = vivas
    .filter((p) => p.tipo === 'M' && !(p.status === 'pendente' && now.getTime() >= prazo))
    .sort(porChegada);
  const diaristas = vivas.filter((p) => p.tipo === 'D').sort(porChegada);

  const principalM = mensalistas.slice(0, vagas);
  const sobra = vagas - principalM.length;
  const principal = [...principalM, ...diaristas.slice(0, sobra)].map(item);
  const fila = diaristas.slice(sobra).map(item);

  const naJanela = now >= aberturaLista(dataQuarta) && now < fimJogo(dataQuarta);
  return {
    aberta: estadoManual === 'aberta' || (estadoManual === null && naJanela),
    cancelada: estadoManual === 'cancelada',
    principal,
    fila,
    vagas,
  };
}

/** Só quem está na lista principal e ainda não confirmou. */
export function podeConfirmar(estado: EstadoLista, jogadorId: number): boolean {
  return estado.principal.some((i) => i.jogadorId === jogadorId && !i.confirmado);
}

/** Por que o jogador não pode mexer na própria presença agora (`null` = pode). */
export type Trava = 'cancelada' | 'fechada' | 'comecou';

/**
 * O jogador mexe na lista (confirmar, sair, entrar na fila) só com ela aberta e até a hora do
 * jogo. Se o admin abriu à mão, vale mesmo depois do horário. O admin nunca é travado.
 */
export function travaDoJogador(
  estado: EstadoLista,
  dataQuarta: string,
  estadoManual: EstadoManual,
  now: Date,
): Trava | null {
  if (estado.cancelada) return 'cancelada';
  if (!estado.aberta) return 'fechada';
  if (estadoManual !== 'aberta' && now >= inicioJogo(dataQuarta)) return 'comecou';
  return null;
}
