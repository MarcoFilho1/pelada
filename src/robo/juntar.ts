// Privado: mensagens quebradas ("fala mano" / "o que você faz?" / "me manda a lista") viram um
// pedido só. A primeira começa a ser tratada na hora; se chegar outra da mesma pessoa antes da
// resposta sair, a resposta em andamento é descartada e o pedido é refeito com tudo junto. Se o
// robô já fez uma ação (tirou alguém da lista, cadastrou), não descarta: termina, e a mensagem nova
// vira o próximo pedido (assim nada é feito duas vezes). No grupo não junta: cada marcação vale sozinha.
import type { Cancelamento, MensagemRecebida } from './responder';

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

type Opcoes = {
  /** Põe a tarefa na fila do robô (uma coisa por vez). */
  agendar: (tarefa: () => Promise<void>) => void;
  /** Trata o pedido; o responder marca `cancelar.cancelou` se descartou a resposta. */
  tratar: (m: MensagemRecebida, cancelar: Cancelamento) => Promise<void>;
  /** A primeira mensagem de cada pedido (para a ⌛ aparecer logo). */
  aoComecar: (m: MensagemRecebida) => void;
};

type Conversa = { pendentes: MensagemRecebida[]; rodando: boolean; superada: boolean };

const chave = (m: MensagemRecebida) => `${m.grupoId}|${m.remetente ?? m.remetenteTelefone ?? m.remetenteNome ?? '?'}`;

export class PedidosDoPrivado {
  private conversas = new Map<string, Conversa>();

  constructor(private op: Opcoes) {}

  receber(m: MensagemRecebida): void {
    const k = chave(m);
    const c = this.conversas.get(k);
    if (c) {
      c.pendentes.push(m);
      // Na fila ainda: só entra no mesmo pedido. Sendo tratado: pede para refazer com tudo junto.
      if (c.rodando) c.superada = true;
      return;
    }
    this.conversas.set(k, { pendentes: [m], rodando: false, superada: false });
    this.op.aoComecar(m);
    this.op.agendar(() => this.processar(k));
  }

  private async processar(k: string): Promise<void> {
    const c = this.conversas.get(k);
    if (!c) return;
    const lote = c.pendentes.splice(0);
    c.rodando = true;
    c.superada = false;
    const cancelar: Cancelamento = { pedido: () => c.superada, cancelou: false };
    try {
      await this.op.tratar(juntarMensagens(lote), cancelar);
    } finally {
      c.rodando = false;
      if (cancelar.cancelou) c.pendentes.unshift(...lote);
      else if (c.pendentes.length) this.op.aoComecar(c.pendentes[0]);
      if (c.pendentes.length) this.op.agendar(() => this.processar(k));
      else this.conversas.delete(k);
    }
  }
}
