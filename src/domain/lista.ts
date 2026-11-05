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
  // Mensalista além das vagas (só acontece com mais de 16 M vivos) vai pra frente da fila: ninguém some.
  const fila = [...mensalistas.slice(vagas), ...diaristas.slice(sobra)].map(item);

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
  // "Começou" antes de "fechada": fechada à mão depois das 20:30 também não deixa mais sair.
  if (estadoManual !== 'aberta' && now >= inicioJogo(dataQuarta)) return 'comecou';
  if (!estado.aberta) return 'fechada';
  return null;
}

/** Onde o jogador está na lista da semana, para o bloco do topo da tela. */
export type Situacao =
  | { onde: 'principal'; posicao: number; confirmado: boolean; tipo: 'M' | 'D' }
  | { onde: 'fila'; posicao: number }
  | { onde: 'perdeu_prazo' }
  | { onde: 'fora' };

export function situacaoDoJogador(
  estado: EstadoLista & { foraDoPrazo: ItemLista[] },
  jogadorId: number,
): Situacao {
  const i = estado.principal.findIndex((x) => x.jogadorId === jogadorId);
  if (i >= 0) {
    const item = estado.principal[i];
    return { onde: 'principal', posicao: i + 1, confirmado: item.confirmado, tipo: item.tipo };
  }
  const f = estado.fila.findIndex((x) => x.jogadorId === jogadorId);
  if (f >= 0) return { onde: 'fila', posicao: f + 1 };
  if (estado.foraDoPrazo.some((x) => x.jogadorId === jogadorId)) return { onde: 'perdeu_prazo' };
  return { onde: 'fora' };
}

/**
 * Sair (Não vou, Sair da fila) é mais solto que entrar: lista fechada pelo admin ou ainda não
 * aberta não impede ninguém de sair. Só a pelada cancelada e o jogo já começado travam.
 */
export function travaParaSair(
  estado: EstadoLista,
  dataQuarta: string,
  estadoManual: EstadoManual,
  now: Date,
): Extract<Trava, 'cancelada' | 'comecou'> | null {
  if (estado.cancelada) return 'cancelada';
  if (estadoManual !== 'aberta' && now >= inicioJogo(dataQuarta)) return 'comecou';
  return null;
}
