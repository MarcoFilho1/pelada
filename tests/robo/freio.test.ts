import { describe, expect, it } from 'vitest';
import { Freio, LIMITE_PERGUNTAS, LIMITE_RESPOSTAS, TEXTO_LIMITE } from '@/robo/freio';

function relogio(inicio: string) {
  let t = new Date(inicio).getTime();
  return { agora: () => new Date(t), avancar: (ms: number) => (t += ms) };
}

describe('Freio', () => {
  it('até 10 respostas em 60 s corridos; a 11ª espera a mais antiga sair da janela', () => {
    const r = relogio('2026-11-11T15:00:00Z');
    const f = new Freio(r.agora);
    for (let i = 0; i < LIMITE_RESPOSTAS; i++) {
      expect(f.podeResponder()).toBe(true);
      f.registrarResposta();
      r.avancar(1_000);
    }
    expect(f.podeResponder()).toBe(false); // 10 respostas entre 0 s e 9 s; agora é 10 s
    r.avancar(49_000); // 59 s: a primeira ainda conta
    expect(f.podeResponder()).toBe(false);
    r.avancar(1_000); // 60 s: a primeira saiu
    expect(f.podeResponder()).toBe(true);
    f.registrarResposta();
    expect(f.podeResponder()).toBe(false);
  });

  it('aviso de "muita gente": no máximo um por 60 s e não conta nas 10', () => {
    const r = relogio('2026-11-11T15:00:00Z');
    const f = new Freio(r.agora);
    for (let i = 0; i < LIMITE_RESPOSTAS; i++) f.registrarResposta();
    expect(f.podeAvisar()).toBe(true);
    f.registrarAviso();
    expect(f.podeAvisar()).toBe(false);
    r.avancar(59_000);
    expect(f.podeAvisar()).toBe(false);
    r.avancar(1_000);
    expect(f.podeAvisar()).toBe(true);
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
    expect(LIMITE_RESPOSTAS).toBe(10);
    expect(TEXTO_LIMITE).toBe('Por hoje acabaram as perguntas livres. Os comandos continuam: lista, falta confirmar, fila.');
  });
});
