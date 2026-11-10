import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { enviarComConfirmacao, EVENTO_ACK, type SocketDeEnvio } from '@/robo/whatsapp';

/** Socket falso: `sendMessage` resolve como na Baileys (quadro escrito localmente); o ack vem (ou não) depois. */
function socketFalso(ack: ((id: string) => Record<string, string> | null) | null) {
  const ws = new EventEmitter();
  const sendMessage = vi.fn(async (_jid: string, conteudo: { text: string }, { messageId }: { messageId: string }) => {
    const attrs = ack?.(messageId);
    if (attrs) setTimeout(() => ws.emit(EVENTO_ACK, { attrs: { class: 'message', ...attrs } }), 5);
    return { message: { conversation: conteudo.text } };
  });
  return { sock: { ws, sendMessage } as unknown as SocketDeEnvio, ws, sendMessage };
}

describe('enviarComConfirmacao (ack do servidor)', () => {
  it('resolve só com o ack do mesmo id e usa o id gerado aqui', async () => {
    const { sock, ws, sendMessage } = socketFalso((id) => ({ id }));
    const escrita = vi.fn();
    await enviarComConfirmacao(sock, 'g@g.us', 'oi', 'ID1', 1_000, escrita);
    expect(sendMessage).toHaveBeenCalledWith('g@g.us', { text: 'oi' }, { messageId: 'ID1' });
    expect(escrita).toHaveBeenCalledWith({ conversation: 'oi' });
    expect(ws.listenerCount(EVENTO_ACK)).toBe(0);
  });

  it('sendMessage resolve mas o ack não chega: rejeita avisando que pode sair duplicada', async () => {
    const { sock, ws } = socketFalso(null);
    await expect(enviarComConfirmacao(sock, 'g@g.us', 'oi', 'ID1', 50)).rejects.toThrow(/pode sair duplicada/);
    expect(ws.listenerCount(EVENTO_ACK)).toBe(0);
  });

  it('ack de outra mensagem não conta', async () => {
    const { sock } = socketFalso(() => ({ id: 'OUTRO' }));
    await expect(enviarComConfirmacao(sock, 'g@g.us', 'oi', 'ID1', 50)).rejects.toThrow(/pode sair duplicada/);
  });

  it('ack com erro: rejeita', async () => {
    const { sock, ws } = socketFalso((id) => ({ id, error: '479' }));
    await expect(enviarComConfirmacao(sock, 'g@g.us', 'oi', 'ID1', 1_000)).rejects.toThrow(/recusou.*479/);
    expect(ws.listenerCount(EVENTO_ACK)).toBe(0);
  });

  it('ack que chega antes do sendMessage resolver também vale', async () => {
    const ws = new EventEmitter();
    const sock = {
      ws,
      sendMessage: async (_j: string, _c: { text: string }, { messageId }: { messageId: string }) => {
        ws.emit(EVENTO_ACK, { attrs: { id: messageId } });
        await new Promise((r) => setTimeout(r, 10));
        return undefined;
      },
    } as unknown as SocketDeEnvio;
    await expect(enviarComConfirmacao(sock, 'g@g.us', 'oi', 'ID1', 1_000)).resolves.toBeUndefined();
  });

  it('sendMessage que falha: rejeita e solta o ouvinte', async () => {
    const ws = new EventEmitter();
    const sock = { ws, sendMessage: async () => Promise.reject(new Error('socket fechado')) } as unknown as SocketDeEnvio;
    await expect(enviarComConfirmacao(sock, 'g@g.us', 'oi', 'ID1', 1_000)).rejects.toThrow('socket fechado');
    expect(ws.listenerCount(EVENTO_ACK)).toBe(0);
  });
});
