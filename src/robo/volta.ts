import type { EstadoDaSemana } from '@/server/presencas';
import { decidir, type EstadoDoRobo } from './agenda';
import { aposEnvio } from './estado';
import { fotografar } from './foto';
import { montarMensagem } from './mensagem';

export type DepsDaVolta = {
  lerLista: (now: Date) => Promise<EstadoDaSemana>;
  /** Resolve só com o envio confirmado pelo WhatsApp. */
  enviar: (texto: string) => Promise<void>;
  gravar: (estado: EstadoDoRobo) => void;
  log: (linha: string) => void;
};

/**
 * Uma volta do laço: lê a lista, decide, envia e só depois do envio confirmado grava o estado.
 * Erro de banco ou de envio: registra e devolve o estado como estava (a próxima volta tenta de novo).
 */
export async function umaVolta(now: Date, estado: EstadoDoRobo, d: DepsDaVolta): Promise<EstadoDoRobo> {
  let novo: EstadoDoRobo;
  try {
    const lista = await d.lerLista(now);
    const foto = fotografar(lista);
    const tipo = decidir(now, foto, estado);
    if (!tipo) {
      d.log('nada a enviar');
      return estado;
    }
    await d.enviar(montarMensagem(tipo, lista, foto, estado.ultimo?.foto ?? null));
    novo = aposEnvio(estado, now, tipo, foto);
    d.log(`enviada: ${tipo}`);
  } catch (err) {
    d.log(`erro (tenta de novo na próxima volta): ${(err as Error).message}`);
    return estado;
  }
  try {
    d.gravar(novo);
  } catch (err) {
    // A mensagem já saiu: o processo segue com o estado novo em memória para não repetir a rodada.
    d.log(`ATENÇÃO: mensagem enviada, mas o estado não foi gravado (${(err as Error).message}).`);
  }
  return novo;
}
