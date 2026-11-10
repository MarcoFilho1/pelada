import { describe, expect, it } from 'vitest';
import { Freio, LIMITE_PERGUNTAS, TEXTO_LIMITE } from '@/robo/freio';

function relogio(inicio: string) {
  let t = new Date(inicio).getTime();
  return { agora: () => new Date(t), avancar: (ms: number) => (t += ms) };
}

describe('Freio', () => {
  it('uma resposta por minuto', () => {
    const r = relogio('2026-11-11T15:00:00Z');
    const f = new Freio(r.agora);
    expect(f.podeResponder()).toBe(true);
    f.registrarResposta();
    expect(f.podeResponder()).toBe(false);
    r.avancar(59_000);
    expect(f.podeResponder()).toBe(false);
    r.avancar(1_000);
    expect(f.podeResponder()).toBe(true);
  });

  it('30 perguntas por dia; virada do dia de Recife zera', () => {
    const r = relogio('2026-11-11T20:00:00Z');
    const f = new Freio(r.agora);
    for (let i = 0; i < LIMITE_PERGUNTAS; i++) {
      expect(f.podePerguntar()).toBe(true);
      f.registrarPergunta();
    }
    expect(f.podePerguntar()).toBe(false);
    r.avancar(60 * 60 * 1000); // 21:00Z = 18:00 Recife, mesmo dia
    expect(f.podePerguntar()).toBe(false);
    r.avancar(6 * 60 * 60 * 1000); // 03:00Z = 00:00 Recife do dia seguinte
    expect(f.podePerguntar()).toBe(true);
  });

  it('textos', () => {
    expect(LIMITE_PERGUNTAS).toBe(30);
    expect(TEXTO_LIMITE).toBe('Por hoje acabaram as perguntas livres. Os comandos continuam: lista, falta confirmar, fila.');
  });
});
