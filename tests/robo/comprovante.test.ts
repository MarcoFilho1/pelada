import { describe, expect, it, vi } from 'vitest';
import { lerComprovante, lerResposta } from '@/robo/comprovante';
import type { ClienteIA } from '@/robo/ia';

describe('lerResposta', () => {
  it('lê o JSON, mesmo com texto em volta', () => {
    expect(lerResposta('{"comprovante": true, "pagador": "JOAO PEDRO", "valor": 15}')).toEqual({ ehComprovante: true, pagador: 'JOAO PEDRO', valor: 15 });
    expect(lerResposta('Claro! {"comprovante": true, "pagador": null, "valor": null} pronto')).toEqual({ ehComprovante: true, pagador: null, valor: null });
  });
  it('qualquer coisa estranha: não é comprovante', () => {
    expect(lerResposta('{"comprovante": false}').ehComprovante).toBe(false);
    expect(lerResposta('não sei').ehComprovante).toBe(false);
    expect(lerResposta('{quebrado').ehComprovante).toBe(false);
    expect(lerResposta('{"comprovante": "sim"}').ehComprovante).toBe(false);
  });
});

describe('lerComprovante', () => {
  const cliente = (texto: string) => {
    const create = vi.fn(async () => ({ content: [{ type: 'text', text: texto }] }));
    return { cliente: { messages: { create } } as unknown as ClienteIA, create };
  };

  it('foto vai como imagem; PDF como documento; outro tipo nem pergunta', async () => {
    const a = cliente('{"comprovante": true, "pagador": "CAIO", "valor": 15}');
    expect(await lerComprovante(a.cliente, 'claude-haiku-5-5', Buffer.from('x'), 'image/jpeg')).toMatchObject({ ehComprovante: true, pagador: 'CAIO' });
    const corpo = (a.create.mock.calls[0] as unknown as [{ messages: { content: { type: string }[] }[] }])[0];
    expect(corpo.messages[0].content[0].type).toBe('image');
    const b = cliente('{"comprovante": false}');
    await lerComprovante(b.cliente, 'm', Buffer.from('x'), 'application/pdf');
    expect((b.create.mock.calls[0] as unknown as [{ messages: { content: { type: string }[] }[] }])[0].messages[0].content[0].type).toBe('document');
    const c = cliente('');
    expect((await lerComprovante(c.cliente, 'm', Buffer.from('x'), 'video/mp4')).ehComprovante).toBe(false);
    expect(c.create).not.toHaveBeenCalled();
  });
});
