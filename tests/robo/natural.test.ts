import { describe, expect, it, vi } from 'vitest';
import type { ClienteIA } from '@/robo/ia';
import { limpar, naturalizar, serve, trechosFixos } from '@/robo/natural';

const AVISO = '✅ Pepe confirmou os times. Falta 1: responda *sim* para confirmar.';
const PIX = '⏳ Pix da pelada de 25/11: faltam Caio e João Pedro\nR$ 15,00 pra chave pix@exemplo.com\nManda o comprovante aqui no grupo';

const cliente = (resposta: string | Error | Promise<never>) =>
  ({
    messages: {
      create: vi.fn(async () => {
        if (resposta instanceof Error) throw resposta;
        if (typeof resposta !== 'string') return resposta;
        return { content: [{ type: 'text', text: resposta }], usage: { input_tokens: 100, output_tokens: 20 } };
      }),
    },
  }) as unknown as ClienteIA;

const op = (c: ClienteIA, fixos: string[] = []) => ({ cliente: c, modelo: 'm', para: 'organizador' as const, fixos });

describe('avisos naturais', () => {
  it('os trechos fixos saem do próprio aviso: comandos, números e chaves', () => {
    expect(trechosFixos(AVISO)).toEqual(['*sim*', '1']);
    expect(trechosFixos(PIX)).toEqual(expect.arrayContaining(['25/11', '15,00', 'pix@exemplo.com']));
  });

  it('aceita a reescrita que guarda nomes, números e comandos', () => {
    expect(serve(AVISO, 'Pepe já confirmou os times, falta só 1\nresponde *sim* aí pra fechar', ['Pepe'])).toBe(true);
    expect(serve(PIX, 'galera, do Pix de 25/11 ainda faltam Caio e João Pedro\nR$ 15,00 na chave pix@exemplo.com\nmanda o comprovante aqui', ['Caio', 'João Pedro'])).toBe(true);
    // Sem acento ou em outra caixa ainda é o mesmo nome.
    expect(serve(PIX, 'do Pix de 25/11 faltam caio e joao pedro, R$ 15,00 na chave pix@exemplo.com, manda o comprovante aqui', ['Caio', 'João Pedro'])).toBe(true);
  });

  it('recusa nome trocado, comando sumido, número novo, comando inventado e texto vazio ou enorme', () => {
    expect(serve(AVISO, 'Jonas confirmou os times, falta 1, responde *sim*', ['Pepe'])).toBe(false);
    expect(serve(AVISO, 'Pepe confirmou os times, falta 1, responde sim', ['Pepe'])).toBe(false);
    expect(serve(AVISO, 'Pepe confirmou os times, faltam 2, responde *sim*', ['Pepe'])).toBe(false);
    expect(serve(AVISO, 'Pepe confirmou, falta 1: *sim* ou *nao*', ['Pepe'])).toBe(false);
    expect(serve(PIX, 'faltam Caio e João Pedro, R$ 15,00, manda aí o comprovante da pelada de 25/11', ['Caio', 'João Pedro'])).toBe(false); // sem a chave
    expect(serve(AVISO, '', ['Pepe'])).toBe(false);
    expect(serve(AVISO, `Pepe confirmou, falta 1, *sim* ${'bla '.repeat(60)}`, ['Pepe'])).toBe(false);
  });

  it('limpa aspas e cercas em volta', () => {
    expect(limpar('"Pepe confirmou"')).toBe('Pepe confirmou');
    expect(limpar('```\nPepe confirmou\n```')).toBe('Pepe confirmou');
  });

  it('usa a reescrita boa e conta o uso; a ruim, o erro e a demora devolvem o texto fixo', async () => {
    const aoUsar = vi.fn();
    const boa = cliente('"Pepe confirmou os times, falta 1\nresponde *sim* pra fechar"');
    expect(await naturalizar(AVISO, { ...op(boa, ['Pepe']), aoUsar })).toBe('Pepe confirmou os times, falta 1\nresponde *sim* pra fechar');
    expect(aoUsar).toHaveBeenCalledWith({ entrada: 100, cacheLido: 0, cacheGravado: 0, saida: 20 });
    expect(await naturalizar(AVISO, op(cliente('Jonas confirmou, falta 1, *sim*'), ['Pepe']))).toBe(AVISO);
    expect(await naturalizar(AVISO, op(cliente(new Error('sem crédito')), ['Pepe']))).toBe(AVISO);
    expect(await naturalizar(AVISO, { ...op(cliente(new Promise<never>(() => {})), ['Pepe']), prazoMs: 20 })).toBe(AVISO);
  });

  it('o pedido diz para quem vai e leva o jeito do grupo', async () => {
    const c = cliente('Pepe confirmou os times, falta 1, responde *sim*');
    await naturalizar(AVISO, { ...op(c, ['Pepe']), para: 'grupo', caderno: ['O grupo chama o Jonas de calvinho'] });
    const pedido = (c.messages.create as ReturnType<typeof vi.fn>).mock.calls[0][0].messages[0].content as string;
    expect(pedido).toContain('grupo da pelada');
    expect(pedido).toContain('calvinho');
    expect(pedido).toContain(AVISO);
  });
});
