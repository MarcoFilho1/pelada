import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { enviarComConfirmacao, EVENTO_ACK, lerMensagemRecebida, type SocketDeEnvio } from '@/robo/whatsapp';

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

describe('lerMensagemRecebida (mensagem da Baileys → mensagem do robô)', () => {
  // Números e LIDs fictícios.
  const robo = { id: '5581990000000:7@s.whatsapp.net', lid: '111111111111111:7@lid' };
  const base = {
    key: { remoteJid: 'g@g.us', fromMe: false, id: 'M1', participant: '222222222222222@lid', participantAlt: '5581990000001@s.whatsapp.net' },
    messageTimestamp: 1_762_800_000,
  };
  const texto = (text: string, mentionedJid: string[]) => ({ extendedTextMessage: { text, contextInfo: { mentionedJid } } });

  it('marcação pelo LID do robô no meio do texto: reconhece, tira o @ e lê o telefone do remetente', () => {
    const m = lerMensagemRecebida({ ...base, message: texto('tá na lista? @111111111111111 lista', ['111111111111111@lid']) }, robo);
    expect(m).toEqual({
      grupoId: 'g@g.us',
      remetenteTelefone: '5581990000001',
      remetenteNome: null,
      texto: 'tá na lista? lista',
      mencionaORobo: true,
      respondeAoRobo: false,
      quando: new Date(1_762_800_000 * 1000),
    });
  });

  it('tira só a marcação do robô; a de outro jogador vira @alguém', () => {
    const m = lerMensagemRecebida(
      { ...base, message: texto('@111111111111111 o @333333333333333 está na lista? liga @81 99', ['111111111111111@lid', '333333333333333@lid']) },
      robo,
    );
    expect(m?.texto).toBe('o @alguém está na lista? liga @81 99');
  });

  it('marcação pelo número do robô (JID sem o sufixo do aparelho)', () => {
    const m = lerMensagemRecebida({ ...base, message: texto('@5581990000000 fila', ['5581990000000@s.whatsapp.net']) }, robo);
    expect(m).toMatchObject({ mencionaORobo: true, texto: 'fila' });
  });

  it('nome salvo do robô escrito no texto, sem a menção de verdade: não é marcação', () => {
    const m = lerMensagemRecebida({ ...base, message: texto('@Robô lista', []) }, robo);
    expect(m?.mencionaORobo).toBe(false);
    const outra = lerMensagemRecebida({ ...base, message: texto('@5581990000003 lista', ['5581990000003@s.whatsapp.net']) }, robo);
    expect(outra?.mencionaORobo).toBe(false);
  });

  it('resposta (citação) a uma mensagem do robô: marca respondeAoRobo, sem contar como menção', () => {
    const cita = (participant: string) => ({ extendedTextMessage: { text: 'sim', contextInfo: { participant, stanzaId: 'X', mentionedJid: [] } } });
    expect(lerMensagemRecebida({ ...base, message: cita('111111111111111:7@lid') }, robo)).toMatchObject({ respondeAoRobo: true, mencionaORobo: false, texto: 'sim' });
    expect(lerMensagemRecebida({ ...base, message: cita('5581990000000@s.whatsapp.net') }, robo)?.respondeAoRobo).toBe(true);
    expect(lerMensagemRecebida({ ...base, message: cita('5581990000003@s.whatsapp.net') }, robo)?.respondeAoRobo).toBe(false);
  });

  it('nome do WhatsApp de quem mandou (pushName), sem espaços sobrando; vazio vira null', () => {
    const m = { conversation: 'oi' };
    expect(lerMensagemRecebida({ ...base, pushName: ' Zeca ', message: m }, robo)?.remetenteNome).toBe('Zeca');
    expect(lerMensagemRecebida({ ...base, pushName: '  ', message: m }, robo)?.remetenteNome).toBeNull();
    expect(lerMensagemRecebida({ ...base, pushName: null, message: m }, robo)?.remetenteNome).toBeNull();
  });

  it('texto simples (conversation) não tem menção', () => {
    expect(lerMensagemRecebida({ ...base, message: { conversation: 'oi' } }, robo)).toMatchObject({ texto: 'oi', mencionaORobo: false });
  });

  it('remetente só com LID: telefone desconhecido', () => {
    const key = { ...base.key, participantAlt: undefined };
    const m = lerMensagemRecebida({ ...base, key, message: texto('@111111111111111 sortear', ['111111111111111@lid']) }, robo);
    expect(m?.remetenteTelefone).toBeNull();
  });

  it('remetente com telefone no participant (sem LID)', () => {
    const key = { ...base.key, participant: '5581990000002:3@s.whatsapp.net', participantAlt: undefined };
    expect(lerMensagemRecebida({ ...base, key, message: { conversation: 'oi' } }, robo)?.remetenteTelefone).toBe('5581990000002');
  });

  it('ignora mensagem do próprio robô, privada, status e sem texto', () => {
    const m = texto('@111111111111111', ['111111111111111@lid']);
    expect(lerMensagemRecebida({ ...base, key: { ...base.key, fromMe: true }, message: m }, robo)).toBeNull();
    expect(lerMensagemRecebida({ ...base, key: { ...base.key, remoteJid: '5581990000001@s.whatsapp.net' }, message: m }, robo)).toBeNull();
    expect(lerMensagemRecebida({ ...base, key: { ...base.key, remoteJid: 'status@broadcast' }, message: m }, robo)).toBeNull();
    expect(lerMensagemRecebida({ ...base, message: null }, robo)).toBeNull();
  });
});
