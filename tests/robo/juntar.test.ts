import { describe, expect, it } from 'vitest';
import { PedidosDoPrivado, juntarMensagens } from '@/robo/juntar';
import type { Cancelamento, MensagemRecebida } from '@/robo/responder';

const CONVERSA = '5583111110000@s.whatsapp.net';
const msg = (texto: string, over: Partial<MensagemRecebida> = {}): MensagemRecebida => ({
  grupoId: CONVERSA,
  remetente: CONVERSA,
  remetenteTelefone: '5583111110000',
  remetenteNome: 'Zeca',
  texto,
  mencionaORobo: false,
  respondeAoRobo: false,
  quando: new Date(),
  privado: true,
  ...over,
});

/** Fila manual: cada tarefa só roda quando o teste manda. */
function montar(tratar: (m: MensagemRecebida, c: Cancelamento) => Promise<void>) {
  const fila: (() => Promise<void>)[] = [];
  const comecos: string[] = [];
  const p = new PedidosDoPrivado({ agendar: (t) => void fila.push(t), tratar, aoComecar: (m) => void comecos.push(m.texto) });
  const rodar = async () => {
    while (fila.length) await fila.shift()!();
  };
  return { p, fila, comecos, rodar };
}

describe('PedidosDoPrivado', () => {
  it('uma mensagem: trata na hora (sem esperar)', async () => {
    const tratados: string[] = [];
    const { p, comecos, rodar } = montar(async (m) => void tratados.push(m.texto));
    p.receber(msg('lista'));
    expect(comecos).toEqual(['lista']);
    await rodar();
    expect(tratados).toEqual(['lista']);
  });

  it('chegou outra enquanto ainda estava na fila: entra no mesmo pedido', async () => {
    const tratados: string[] = [];
    const { p, rodar } = montar(async (m) => void tratados.push(m.texto));
    p.receber(msg('fala mano'));
    p.receber(msg('O que voce consegue fazer?'));
    await rodar();
    expect(tratados).toEqual(['fala mano\nO que voce consegue fazer?']);
  });

  it('chegou outra durante a resposta: descarta e refaz com tudo junto', async () => {
    const tratados: string[] = [];
    const ref: { p?: PedidosDoPrivado } = {};
    const m = montar(async (pedido, cancelar) => {
      tratados.push(pedido.texto);
      if (tratados.length === 1) ref.p!.receber(msg('Me manda a lista ai'));
      if (cancelar.pedido()) cancelar.cancelou = true;
    });
    ref.p = m.p;
    m.p.receber(msg('fala mano'));
    await m.rodar();
    expect(tratados).toEqual(['fala mano', 'fala mano\nMe manda a lista ai']);
    expect(m.comecos).toEqual(['fala mano']);
  });

  it('a resposta já tinha feito uma ação (não descartou): a mensagem nova vira o próximo pedido', async () => {
    const tratados: string[] = [];
    const ref: { p?: PedidosDoPrivado } = {};
    const m = montar(async (pedido) => {
      tratados.push(pedido.texto);
      if (tratados.length === 1) ref.p!.receber(msg('e confirma a Ana'));
    });
    ref.p = m.p;
    m.p.receber(msg('tira o João'));
    await m.rodar();
    expect(tratados).toEqual(['tira o João', 'e confirma a Ana']);
    expect(m.comecos).toEqual(['tira o João', 'e confirma a Ana']);
  });

  it('pessoas diferentes não se misturam', async () => {
    const tratados: string[] = [];
    const { p, rodar } = montar(async (m) => void tratados.push(m.texto));
    p.receber(msg('oi'));
    p.receber(msg('lista', { grupoId: 'outro@s.whatsapp.net', remetente: 'outro@s.whatsapp.net' }));
    await rodar();
    expect(tratados).toEqual(['oi', 'lista']);
  });
});

describe('juntarMensagens', () => {
  it('ignora textos vazios e usa a hora da última', () => {
    const a = msg('oi', { quando: new Date(1_000), respondeAoRobo: true, id: 'A' });
    const b = msg('  ', { quando: new Date(2_000) });
    const c = msg('lista', { quando: new Date(3_000) });
    expect(juntarMensagens([a, b, c])).toMatchObject({ id: 'A', texto: 'oi\nlista', respondeAoRobo: true, quando: new Date(3_000) });
  });
});
