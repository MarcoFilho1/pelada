import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JuntarMensagens, juntarMensagens } from '@/robo/juntar';
import type { MensagemRecebida } from '@/robo/responder';

const GRUPO = '120363000000000000@g.us';
const msg = (texto: string, over: Partial<MensagemRecebida> = {}): MensagemRecebida => ({
  grupoId: GRUPO,
  remetente: 'zeca@lid',
  remetenteTelefone: null,
  remetenteNome: 'Zeca',
  texto,
  mencionaORobo: false,
  respondeAoRobo: false,
  quando: new Date(),
  ...over,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function montar() {
  const comecos: MensagemRecebida[] = [];
  const pedidos: MensagemRecebida[] = [];
  const j = new JuntarMensagens({ aoComecar: (m) => comecos.push(m), aoJuntar: (m) => pedidos.push(m) });
  return { j, comecos, pedidos };
}

describe('JuntarMensagens', () => {
  it('mensagens quebradas da mesma pessoa viram um pedido só, 8 s depois da última', () => {
    const { j, comecos, pedidos } = montar();
    j.receber(msg('fala mano', { mencionaORobo: true, id: 'A' }), true);
    expect(comecos.map((m) => m.id)).toEqual(['A']);
    vi.advanceTimersByTime(5_000);
    j.receber(msg('O que voce consegue fazer?'), false);
    vi.advanceTimersByTime(6_000);
    j.receber(msg('Me manda a lista ai'), false);
    vi.advanceTimersByTime(7_999);
    expect(pedidos).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({ id: 'A', texto: 'fala mano\nO que voce consegue fazer?\nMe manda a lista ai', mencionaORobo: true });
  });

  it('sem marcação, não começa pedido; outra pessoa ou outra conversa não entra', () => {
    const { j, pedidos } = montar();
    j.receber(msg('bom dia'), false);
    vi.advanceTimersByTime(60_000);
    expect(pedidos).toEqual([]);
    j.receber(msg('lista', { mencionaORobo: true }), true);
    j.receber(msg('eu vou', { remetente: 'ana@lid', remetenteNome: 'Ana' }), false);
    j.receber(msg('oi', { grupoId: 'outro@g.us' }), false);
    vi.advanceTimersByTime(8_000);
    expect(pedidos.map((p) => p.texto)).toEqual(['lista']);
  });

  it('quem não para de escrever: responde em até 30 s; e no máximo 6 mensagens', () => {
    const { j, pedidos } = montar();
    j.receber(msg('1', { mencionaORobo: true }), true);
    for (let i = 2; i <= 5; i++) {
      vi.advanceTimersByTime(7_000);
      j.receber(msg(String(i)), false);
    }
    vi.advanceTimersByTime(2_000);
    expect(pedidos.map((p) => p.texto)).toEqual(['1\n2\n3\n4\n5']);
    for (let i = 1; i <= 6; i++) j.receber(msg(String(i), { mencionaORobo: i === 1 }), i === 1);
    expect(pedidos.at(-1)?.texto).toBe('1\n2\n3\n4\n5\n6');
  });

  it('juntarMensagens: ignora textos vazios e usa a hora da última', () => {
    const a = msg('oi', { quando: new Date(1_000), respondeAoRobo: true });
    const b = msg('  ', { quando: new Date(2_000) });
    const c = msg('lista', { quando: new Date(3_000) });
    expect(juntarMensagens([a, b, c])).toMatchObject({ texto: 'oi\nlista', respondeAoRobo: true, quando: new Date(3_000) });
  });
});
