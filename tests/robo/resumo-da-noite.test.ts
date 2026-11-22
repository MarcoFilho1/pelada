import { describe, expect, it } from 'vitest';
import type { LinhaRanking } from '@/domain/ranking';
import { horaDeTentarResumo, horaDoResumo, tabelasGerais, textoDaNoite, textosDoResumo } from '@/robo/resumo-da-noite';

let id = 0;
function linha(nome: string, n: Partial<Pick<LinhaRanking, 'gols' | 'assistencias' | 'vitorias'>> = {}): LinhaRanking {
  const gols = n.gols ?? 0;
  const assistencias = n.assistencias ?? 0;
  const vitorias = n.vitorias ?? 0;
  return { jogadorId: ++id, nome, gols, assistencias, vitorias, pontos: 3 * vitorias + gols + assistencias, jogos: 3, empates: 0, derrotas: 0, aproveitamento: 0, golsPorJogo: 0, presencas: 1 };
}

// Recife = UTC-03:00: 22:35 em Recife = 01:35Z do dia seguinte.
const t = (iso: string) => new Date(iso);

describe('horaDoResumo', () => {
  it('entre 22:35 e 22:40 de Recife, sempre a mesma para a mesma data', () => {
    for (const data of ['2026-11-25', '2026-12-02', '2026-12-09', '2027-01-06']) {
      const h = horaDoResumo(data);
      expect(h.getTime()).toBeGreaterThanOrEqual(Date.parse(`${data}T22:35:00-03:00`));
      expect(h.getTime()).toBeLessThanOrEqual(Date.parse(`${data}T22:40:00-03:00`));
      expect(horaDoResumo(data).getTime()).toBe(h.getTime());
    }
  });

  it('muda de uma semana para outra', () => {
    const horas = new Set(['2026-11-25', '2026-12-02', '2026-12-09', '2026-12-16'].map((d) => horaDoResumo(d).getTime() % 360_000));
    expect(horas.size).toBeGreaterThan(1);
  });
});

describe('horaDeTentarResumo', () => {
  const data = '2026-11-25';
  const alvo = horaDoResumo(data);
  it('antes da hora, não; depois, sim; mandado hoje ou depois das 23:00, não', () => {
    expect(horaDeTentarResumo(new Date(alvo.getTime() - 1000), null)).toBe(false);
    expect(horaDeTentarResumo(alvo, null)).toBe(true);
    expect(horaDeTentarResumo(t('2026-11-25T22:55:00-03:00'), '2026-11-18')).toBe(true);
    expect(horaDeTentarResumo(t('2026-11-25T22:55:00-03:00'), data)).toBe(false);
    expect(horaDeTentarResumo(t('2026-11-25T23:00:00-03:00'), null)).toBe(false);
    expect(horaDeTentarResumo(t('2026-11-25T15:00:00-03:00'), null)).toBe(false);
  });
});

describe('textoDaNoite', () => {
  it('artilheiro, garçom e mais vitórias numa mensagem, com empates e plural', () => {
    const hoje = [
      linha('Pepe', { gols: 3, vitorias: 2 }),
      linha('Manoel', { assistencias: 2, vitorias: 4 }),
      linha('Israel', { assistencias: 2, gols: 1 }),
      linha('Luiz', { gols: 3, assistencias: 1 }),
    ];
    expect(textoDaNoite(hoje)).toBe(
      '🏁 Fim de pelada! Destaques de hoje:\n⚽ Artilheiro: Pepe e Luiz (3 gols)\n🎯 Garçom: Manoel e Israel (2 assistências)\n🏆 Mais vitórias: Manoel (4 vitórias)',
    );
  });

  it('singular e linhas que ninguém fez ficam de fora', () => {
    expect(textoDaNoite([linha('Ana', { gols: 1, vitorias: 1 })])).toBe('🏁 Fim de pelada! Destaques de hoje:\n⚽ Artilheiro: Ana (1 gol)\n🏆 Mais vitórias: Ana (1 vitória)');
  });

  it('noite sem nada (ou sem partidas): null', () => {
    expect(textoDaNoite([])).toBeNull();
    expect(textoDaNoite([linha('Ana')])).toBeNull();
  });
});

describe('tabelasGerais', () => {
  it('três mensagens, top 5 cada, medalhas nos 3 primeiros', () => {
    const geral = ['A', 'B', 'C', 'D', 'E', 'F'].map((n, i) => linha(n, { gols: 10 - i, assistencias: i + 1, vitorias: 6 - i }));
    const [art, gar, vit] = tabelasGerais(geral);
    expect(art).toBe('⚽ Artilharia geral:\n🥇 A 10\n🥈 B 9\n🥉 C 8\n4. D 7\n5. E 6');
    expect(gar).toBe('🎯 Garçons geral:\n🥇 F 6\n🥈 E 5\n🥉 D 4\n4. C 3\n5. B 2');
    expect(vit).toBe('🏆 Vitórias geral:\n🥇 A 6\n🥈 B 5\n🥉 C 4\n4. D 3\n5. E 2');
  });

  it('tabela sem ninguém pontuando fica de fora', () => {
    expect(tabelasGerais([linha('Ana', { gols: 2 })])).toEqual(['⚽ Artilharia geral:\n🥇 Ana 2']);
  });
});

describe('textosDoResumo', () => {
  it('a noite primeiro, depois as tabelas; noite vazia: nada', () => {
    const r = textosDoResumo([linha('Ana', { gols: 1 })], [linha('Ana', { gols: 1 }), linha('Bia', { vitorias: 2 })]);
    expect(r).toHaveLength(3);
    expect(r[0]).toMatch(/^🏁/);
    expect(r[1]).toMatch(/^⚽ Artilharia geral/);
    expect(r[2]).toMatch(/^🏆 Vitórias geral/);
    expect(textosDoResumo([], [linha('Ana', { gols: 1 })])).toEqual([]);
  });
});
