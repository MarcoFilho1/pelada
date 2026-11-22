// Mensagens quebradas ("@robo fala mano" / "o que você faz?" / "me manda a lista") viram um pedido
// só: quando alguém chama o robô, ele espera um pouco por mais mensagens da mesma pessoa na mesma
// conversa (com ou sem marcação) e junta tudo. Mensagem de outra pessoa não entra.
import type { MensagemRecebida } from './responder';

/** Espera depois da última mensagem da pessoa (no grupo, quem quebra leva ~7 s entre uma e outra). */
export const ESPERA_JUNTAR_MS = 8_000;
/** Espera máxima desde a primeira mensagem, mesmo que a pessoa continue escrevendo. */
export const ESPERA_MAXIMA_JUNTAR_MS = 30_000;
/** Mensagens por pedido; passou disso, responde o que já tem. */
export const MAX_MENSAGENS_JUNTADAS = 6;

type Opcoes = {
  /** A primeira mensagem do pedido (para a ⌛ aparecer logo). */
  aoComecar: (m: MensagemRecebida) => void;
  /** O pedido pronto, com os textos juntos. */
  aoJuntar: (m: MensagemRecebida) => void;
  esperaMs?: number;
  esperaMaximaMs?: number;
  maxMensagens?: number;
};

type Pedido = { mensagens: MensagemRecebida[]; comeco: number; timer: NodeJS.Timeout };

const chave = (m: MensagemRecebida) => `${m.grupoId}|${m.remetente ?? m.remetenteTelefone ?? m.remetenteNome ?? '?'}`;

/** Os textos em ordem, uma linha cada; a marcação e o "responde ao robô" valem se qualquer uma tiver. */
export function juntarMensagens(ms: MensagemRecebida[]): MensagemRecebida {
  const ultima = ms[ms.length - 1];
  return {
    ...ms[0],
    texto: ms
      .map((m) => m.texto.trim())
      .filter(Boolean)
      .join('\n'),
    mencionaORobo: ms.some((m) => m.mencionaORobo),
    respondeAoRobo: ms.some((m) => m.respondeAoRobo),
    quando: ultima.quando,
  };
}

export class JuntarMensagens {
  private pedidos = new Map<string, Pedido>();

  constructor(private op: Opcoes) {}

  /** `chamaORobo`: a mensagem sozinha já seria tratada (marcação, resposta ao robô, privado). */
  receber(m: MensagemRecebida, chamaORobo: boolean): void {
    const k = chave(m);
    const p = this.pedidos.get(k);
    if (p) {
      clearTimeout(p.timer);
      p.mensagens.push(m);
      const max = this.op.maxMensagens ?? MAX_MENSAGENS_JUNTADAS;
      if (p.mensagens.length >= max) return this.fechar(k);
      p.timer = setTimeout(() => this.fechar(k), this.espera(p));
      return;
    }
    if (!chamaORobo) return;
    this.op.aoComecar(m);
    const comeco = Date.now();
    const timer = setTimeout(() => this.fechar(k), Math.min(this.op.esperaMs ?? ESPERA_JUNTAR_MS, this.op.esperaMaximaMs ?? ESPERA_MAXIMA_JUNTAR_MS));
    this.pedidos.set(k, { mensagens: [m], comeco, timer });
  }

  /** Quanto ainda esperar: a espera normal, sem passar da máxima desde a primeira mensagem. */
  private espera(p: Pedido): number {
    const resta = p.comeco + (this.op.esperaMaximaMs ?? ESPERA_MAXIMA_JUNTAR_MS) - Date.now();
    return Math.max(0, Math.min(this.op.esperaMs ?? ESPERA_JUNTAR_MS, resta));
  }

  private fechar(k: string): void {
    const p = this.pedidos.get(k);
    if (!p) return;
    clearTimeout(p.timer);
    this.pedidos.delete(k);
    this.op.aoJuntar(juntarMensagens(p.mensagens));
  }
}
