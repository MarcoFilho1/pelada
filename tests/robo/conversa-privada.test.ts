import { describe, expect, it } from 'vitest';
import { ConversasPrivadas, MAX_DESFAZER, MAX_FALAS, MAX_TEXTO_FALA, VALIDADE_CONVERSA_MS } from '@/robo/conversa-privada';

const T0 = new Date('2026-11-16T18:00:00-03:00');
const depois = (ms: number) => new Date(T0.getTime() + ms);
const mudanca = (nome: string) => ({ peladaId: 1, jogadorId: 1, nome, antes: null });

describe('ConversasPrivadas', () => {
  it('guarda pergunta e resposta, separado por organizador', () => {
    const m = new ConversasPrivadas();
    m.registrar('a', 'oi', 'fala!', T0);
    expect(m.historico('a', T0)).toEqual([
      { papel: 'user', texto: 'oi' },
      { papel: 'assistant', texto: 'fala!' },
    ]);
    expect(m.historico('b', T0)).toEqual([]);
  });

  it('só as últimas falas, cada uma cortada', () => {
    const m = new ConversasPrivadas();
    for (let i = 0; i < 8; i++) m.registrar('a', `p${i}`, `r${i}`, T0);
    const h = m.historico('a', T0);
    expect(h).toHaveLength(MAX_FALAS);
    expect(h[0]).toEqual({ papel: 'user', texto: `p${8 - MAX_FALAS / 2}` });
    m.registrar('a', 'x'.repeat(MAX_TEXTO_FALA + 50), 'ok', T0);
    expect(m.historico('a', T0).at(-2)!.texto).toHaveLength(MAX_TEXTO_FALA);
  });

  it('30 minutos sem conversa: começa do zero (falas e desfazer)', () => {
    const m = new ConversasPrivadas();
    m.registrar('a', 'oi', 'fala!', T0);
    m.guardarDesfazer('a', [mudanca('Caio')], T0);
    expect(m.historico('a', depois(VALIDADE_CONVERSA_MS - 1))).toHaveLength(2);
    expect(m.historico('a', depois(2 * VALIDADE_CONVERSA_MS))).toEqual([]);
    expect(m.tirarDesfazer('a', depois(2 * VALIDADE_CONVERSA_MS))).toBeNull();
  });

  it('desfazer: da mensagem mais nova para a mais velha, até o limite', () => {
    const m = new ConversasPrivadas();
    for (let i = 0; i < MAX_DESFAZER + 2; i++) m.guardarDesfazer('a', [mudanca(`J${i}`)], T0);
    m.guardarDesfazer('a', [], T0);
    expect(m.tirarDesfazer('a', T0)).toEqual([mudanca(`J${MAX_DESFAZER + 1}`)]);
    let resto = 0;
    while (m.tirarDesfazer('a', T0)) resto++;
    expect(resto).toBe(MAX_DESFAZER - 1);
  });
});
