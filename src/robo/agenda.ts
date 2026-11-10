import { aberturaLista, dataDe, inicioJogo, prazoMensalista } from '@/domain/tempo';
import { haMudanca, mudancas, type FotoDaLista } from './foto';

export type TipoMensagem = 'abertura' | 'primeira' | 'rodada' | 'lembrete' | 'prazo' | 'cancelada' | 'voltou';

/** `rodada` = ISO do :00/:30 em que a mensagem saiu. */
export type Envio = { quando: string; rodada: string; tipo: TipoMensagem; foto: FotoDaLista };

export type EstadoDoRobo = {
  ultimo: Envio | null;
  /** `dataQuarta` da semana cuja abertura já foi anunciada. */
  aberturaEnviada: string | null;
  grupoId: string | null;
  /** Nome do grupo na hora do `robo:configurar` (só para mostrar ao usuário). */
  grupoNome?: string | null;
};

const MEIA_HORA_MS = 30 * 60 * 1000;
const HORA_MS = 60 * 60 * 1000;
/** A rodada só sai nos primeiros minutos do :00/:30 (Mac que acorda no meio espera a próxima). */
const TOLERANCIA_RODADA_MS = 5 * 60 * 1000;
// Recife é sempre UTC-03:00 (sem horário de verão), como em tempo.ts.
const OFFSET_RECIFE_MS = -3 * HORA_MS;

/** Arredonda para baixo ao :00/:30. */
export function rodadaDe(now: Date): Date {
  return new Date(Math.floor(now.getTime() / MEIA_HORA_MS) * MEIA_HORA_MS);
}

export function emSilencio(now: Date): boolean {
  const hora = new Date(now.getTime() + OFFSET_RECIFE_MS).getUTCHours();
  return hora >= 23 || hora < 8;
}

export function decidir(now: Date, foto: FotoDaLista, estado: EstadoDoRobo): TipoMensagem | null {
  const data = foto.dataQuarta;
  const segunda14 = new Date(aberturaLista(data).getTime() + 14 * HORA_MS);
  if (now < segunda14 || now >= inicioJogo(data)) return null;
  if (emSilencio(now)) return null;

  const rodada = rodadaDe(now);
  if (estado.ultimo?.rodada === rodada.toISOString()) return null;

  const anterior = estado.ultimo && estado.ultimo.foto.dataQuarta === data ? estado.ultimo.foto : null;

  const cancelada = foto.estadoManual === 'cancelada';
  const eraCancelada = anterior?.estadoManual === 'cancelada';
  if (cancelada) return eraCancelada ? null : 'cancelada';
  if (eraCancelada) return 'voltou';

  if (!anterior && estado.aberturaEnviada !== data && dataDe(now) === dataDe(segunda14)) return 'abertura';

  const ms = rodada.getTime();
  const quarta12 = new Date(`${data}T12:00:00-03:00`).getTime();
  if (ms === quarta12 && Object.values(foto.jogadores).some((j) => j.tipo === 'M' && j.onde === 'pendente')) return 'lembrete';
  if (ms === prazoMensalista(data).getTime()) return 'prazo';

  if (!anterior) return 'primeira';
  if (now.getTime() - ms >= TOLERANCIA_RODADA_MS) return null;
  return haMudanca(mudancas(anterior, foto)) ? 'rodada' : null;
}
