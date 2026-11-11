import { describe, expect, it } from 'vitest';
import type { ItemLista } from '@/domain/lista';
import { textoWhatsApp } from '@/domain/copiarLista';
import type { EstadoDaSemana } from '@/server/presencas';
import { fotografar } from '@/robo/foto';
import { montarMensagem } from '@/robo/mensagem';

const item = (jogadorId: number, nome: string, confirmado = false, tipo: 'M' | 'D' = 'M'): ItemLista => ({ jogadorId, nome, tipo, confirmado });
function estado(p: Partial<Pick<EstadoDaSemana, 'principal' | 'fila' | 'foraDoPrazo' | 'estadoManual'>> = {}): EstadoDaSemana {
  return {
    aberta: true,
    cancelada: p.estadoManual === 'cancelada',
    principal: p.principal ?? [],
    fila: p.fila ?? [],
    vagas: 16,
    peladaId: 1,
    data: '2026-11-11',
    estadoManual: p.estadoManual ?? null,
    foraDoPrazo: p.foraDoPrazo ?? [],
  };
}
const lista = (e: EstadoDaSemana) => textoWhatsApp(e, e.data);

describe('montarMensagem', () => {
  const antes = estado({ principal: [item(1, 'Ana'), item(2, 'Bia')] });
  const depois = estado({ principal: [item(1, 'Ana', true), item(2, 'Bia')] });

  it('abertura', () => {
    expect(montarMensagem('abertura', antes, fotografar(antes), null)).toBe(`📋 A lista de quarta, 11/11 está aberta! Bora confirmar ⚽\n\n${lista(antes)}`);
  });
  it('primeira', () => {
    expect(montarMensagem('primeira', antes, fotografar(antes), null)).toBe(`📋 Lista de quarta, 11/11:\n\n${lista(antes)}`);
  });
  it('rodada: cabeçalho na primeira linha', () => {
    const m = montarMensagem('rodada', depois, fotografar(depois), fotografar(antes));
    expect(m).toBe(`✅ Confirmaram: Ana.\n\n${lista(depois)}`);
  });
  it('lembrete', () => {
    const m = montarMensagem('lembrete', depois, fotografar(depois), fotografar(depois));
    expect(m).toBe(`⏰ Faltam 2 horas pros mensalistas confirmarem! Ainda não confirmaram: Bia.\n\n${lista(depois)}`);
  });
  it('lembrete junta vários nomes e ignora diaristas', () => {
    const e = estado({ principal: [item(1, 'Ana'), item(2, 'Bia'), item(3, 'Caio'), item(4, 'Duda', false, 'D')] });
    const m = montarMensagem('lembrete', e, fotografar(e), null);
    expect(m.split('\n')[0]).toBe('⏰ Faltam 2 horas pros mensalistas confirmarem! Ainda não confirmaram: Ana, Bia e Caio.');
  });
  it('prazo com quem perdeu', () => {
    const d = estado({ principal: [item(1, 'Ana', true), item(3, 'Caio', true)], foraDoPrazo: [item(2, 'Bia')] });
    const m = montarMensagem('prazo', d, fotografar(d), fotografar(antes));
    expect(m).toContain('🔒 Prazo dos mensalistas encerrado.\n❌ Perderam a vaga: Bia.');
    expect(m).not.toContain('⌛ Perderam o prazo');
    expect(m).not.toContain('🙌 Todos os mensalistas confirmaram!');
    expect(m.endsWith(lista(d))).toBe(true);
  });
  it('prazo com subida da fila', () => {
    const a = estado({ principal: [item(1, 'Ana', true), item(2, 'Bia')], fila: [item(5, 'Edu', false, 'D')] });
    const d = estado({ principal: [item(1, 'Ana', true), item(5, 'Edu', true, 'D')], foraDoPrazo: [item(2, 'Bia')] });
    const m = montarMensagem('prazo', d, fotografar(d), fotografar(a));
    expect(m).toContain('🔒 Prazo dos mensalistas encerrado.\n❌ Perderam a vaga: Bia.\n⬆️ Subiram da fila: Edu.');
  });
  it('prazo sem ninguém perder', () => {
    const d = estado({ principal: [item(1, 'Ana', true)] });
    const m = montarMensagem('prazo', d, fotografar(d), fotografar(d));
    expect(m).toBe(`🔒 Prazo dos mensalistas encerrado.\n🙌 Todos os mensalistas confirmaram!\n\n${lista(d)}`);
  });
  it('cancelada não tem lista', () => {
    const c = estado({ estadoManual: 'cancelada' });
    const m = montarMensagem('cancelada', c, fotografar(c), fotografar(antes));
    expect(m).toBe('🌧️ A pelada de quarta, 11/11 foi cancelada.');
    expect(m).not.toContain('Pelada 11/11');
  });
  it('voltou', () => {
    expect(montarMensagem('voltou', antes, fotografar(antes), null)).toBe(`⚽ A pelada de quarta, 11/11 voltou!\n\n${lista(antes)}`);
  });
  it('anterior de outra semana não gera linhas de mudança (prazo, lembrete, rodada)', () => {
    const passada = estado({ principal: [item(9, 'Zeca', true)] });
    const velha = { ...fotografar(passada), dataQuarta: '2026-11-04' };
    const p = estado({ principal: [item(1, 'Ana', true)] });
    expect(montarMensagem('prazo', p, fotografar(p), velha)).toBe(`🔒 Prazo dos mensalistas encerrado.\n🙌 Todos os mensalistas confirmaram!\n\n${lista(p)}`);
    const l = estado({ principal: [item(1, 'Ana')] });
    expect(montarMensagem('lembrete', l, fotografar(l), velha)).toBe(`⏰ Faltam 2 horas pros mensalistas confirmarem! Ainda não confirmaram: Ana.\n\n${lista(l)}`);
    expect(montarMensagem('rodada', p, fotografar(p), velha)).not.toMatch(/Entraram|Saíram/);
  });
});
