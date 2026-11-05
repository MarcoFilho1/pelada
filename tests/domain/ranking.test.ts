import { describe, expect, it } from 'vitest';
import { calcularRanking, destaques, historicoDoJogador, pontosDe, type PartidaEncerrada } from '@/domain/ranking';

let seq = 0;
function partida(
  peladaData: string,
  resultado: 'A' | 'B' | 'empate',
  a: number[],
  b: number[],
  lances: PartidaEncerrada['lances'] = [],
  encerradaEm = new Date(`${peladaData}T23:00:00Z`),
  cores: [PartidaEncerrada['corA'], PartidaEncerrada['corB']] = ['azul', 'laranja'],
): PartidaEncerrada {
  return {
    id: ++seq,
    peladaData,
    encerradaEm,
    resultado,
    corA: cores[0],
    corB: cores[1],
    elenco: [...a.map((jogadorId) => ({ jogadorId, lado: 'A' as const })), ...b.map((jogadorId) => ({ jogadorId, lado: 'B' as const }))],
    lances,
  };
}
const nomes = new Map([
  [1, 'Ana'],
  [2, 'Bia'],
  [3, 'Caio'],
  [4, 'Davi'],
]);
const geral = { tipo: 'geral' } as const;
const linha = (ls: ReturnType<typeof calcularRanking>, id: number) => ls.find((l) => l.jogadorId === id)!;

describe('calcularRanking', () => {
  it('2V 1E 3 gols 1 assistência = 11 pontos', () => {
    const ps = [
      partida('2026-11-04', 'A', [1], [2], [{ jogadorId: 1, tipo: 'gol' }, { jogadorId: 1, tipo: 'gol' }]),
      partida('2026-11-04', 'B', [2], [1], [{ jogadorId: 1, tipo: 'gol' }, { jogadorId: 1, tipo: 'assistencia' }]),
      partida('2026-11-11', 'empate', [1], [2]),
    ];
    const l = linha(calcularRanking(ps, nomes, geral), 1);
    expect(l).toMatchObject({ vitorias: 2, empates: 1, derrotas: 0, gols: 3, assistencias: 1, jogos: 3, pontos: 11, presencas: 2 });
    expect(l.aproveitamento).toBe(77.8);
    expect(l.golsPorJogo).toBe(1);
  });

  it('empate dá 1E para os dois lados e nenhuma derrota', () => {
    const r = calcularRanking([partida('2026-11-04', 'empate', [1], [2])], nomes, geral);
    for (const id of [1, 2]) expect(linha(r, id)).toMatchObject({ empates: 1, derrotas: 0, vitorias: 0, pontos: 1 });
  });

  it('derrota não pontua e jogador sem partidas não aparece', () => {
    const r = calcularRanking([partida('2026-11-04', 'A', [1], [2])], nomes, geral);
    expect(linha(r, 2)).toMatchObject({ derrotas: 1, pontos: 0, aproveitamento: 0 });
    expect(r.map((l) => l.jogadorId).sort()).toEqual([1, 2]);
  });

  it('desempata por vitórias, gols, menos jogos e nome', () => {
    // Ana: 1V = 3 pontos; Bia: 3 empates = 3 pontos, mas menos vitórias.
    const ps = [
      partida('2026-11-04', 'A', [1], [5]),
      partida('2026-11-04', 'empate', [2], [5]),
      partida('2026-11-11', 'empate', [2], [5]),
      partida('2026-11-18', 'empate', [2], [5]),
    ];
    const n = new Map([...nomes, [5, 'Zeca']]);
    const r = calcularRanking(ps, n, geral);
    expect(r.map((l) => l.nome).slice(0, 2)).toEqual(['Ana', 'Bia']);
  });

  it('empate em pontos e vitórias desempata por gols', () => {
    const ps = [
      partida('2026-11-04', 'A', [1], [3]),
      partida('2026-11-04', 'empate', [1], [4]),
      partida('2026-11-11', 'A', [2], [3], [{ jogadorId: 2, tipo: 'gol' }]),
    ];
    // Ana: 1V + 1E = 4 pts, 0 gols (2 jogos). Bia: 1V + 1 gol = 4 pts, 1 gol (1 jogo).
    const r = calcularRanking(ps, nomes, geral);
    expect(linha(r, 1).pontos).toBe(linha(r, 2).pontos);
    expect(r.slice(0, 2).map((l) => l.nome)).toEqual(['Bia', 'Ana']);
  });

  it('empate em tudo: nome (pt-BR, sem acento) decide', () => {
    const n = new Map([[1, 'Édson'], [2, 'Davi'], [3, 'Zeca'], [4, 'Zeca2']]);
    const ps = [partida('2026-11-04', 'A', [1], [3]), partida('2026-11-11', 'A', [2], [4])];
    expect(calcularRanking(ps, n, geral).slice(0, 2).map((l) => l.nome)).toEqual(['Davi', 'Édson']);
  });

  it('menos jogos na frente quando pontos, vitórias e gols empatam', () => {
    // Ana: 1V em 1 jogo (3). Bia: 1V + 1 empate... → 4. Para empatar: Bia 1V + 2D em 3 jogos = 3.
    const ps = [
      partida('2026-11-04', 'A', [1], [3]),
      partida('2026-11-04', 'A', [2], [3]),
      partida('2026-11-11', 'B', [2], [4]),
      partida('2026-11-18', 'B', [2], [4]),
    ];
    const r = calcularRanking(ps, nomes, geral);
    expect(r.slice(0, 3).map((l) => l.nome)).toEqual(['Davi', 'Ana', 'Bia']);
    expect(linha(r, 1).pontos).toBe(linha(r, 2).pontos);
    expect(linha(r, 1).jogos).toBeLessThan(linha(r, 2).jogos);
  });

  it('período usa a data da pelada, não encerradaEm em UTC', () => {
    const p = partida('2026-09-30', 'A', [1], [2], [], new Date('2026-10-01T01:15:00Z'));
    expect(calcularRanking([p], nomes, { tipo: 'mes', ano: 2026, mes: 9 })).toHaveLength(2);
    expect(calcularRanking([p], nomes, { tipo: 'mes', ano: 2026, mes: 10 })).toHaveLength(0);
    expect(calcularRanking([p], nomes, { tipo: 'ano', ano: 2026 })).toHaveLength(2);
    expect(calcularRanking([p], nomes, { tipo: 'ano', ano: 2025 })).toHaveLength(0);
  });

  it('presenças contam quartas, não partidas', () => {
    const ps = [partida('2026-11-04', 'A', [1], [2]), partida('2026-11-04', 'B', [1], [2]), partida('2026-11-11', 'A', [1], [2])];
    expect(linha(calcularRanking(ps, nomes, geral), 1)).toMatchObject({ jogos: 3, presencas: 2 });
  });

  it('ignora lance de quem não estava no elenco', () => {
    const r = calcularRanking([partida('2026-11-04', 'A', [1], [2], [{ jogadorId: 3, tipo: 'gol' }])], nomes, geral);
    expect(r.map((l) => l.jogadorId)).not.toContain(3);
  });
});

describe('destaques', () => {
  it('artilheiro, garçom e mais vitórias; omite quando o máximo é 0', () => {
    const ps = [
      partida('2026-11-04', 'A', [1], [2], [{ jogadorId: 2, tipo: 'gol' }, { jogadorId: 1, tipo: 'assistencia' }]),
    ];
    const r = calcularRanking(ps, nomes, geral);
    const d = destaques(r);
    expect(d.artilheiro?.jogadorId).toBe(2);
    expect(d.garcom?.jogadorId).toBe(1);
    expect(d.maisVitorias?.jogadorId).toBe(1);
    expect(destaques(calcularRanking([partida('2026-11-04', 'empate', [1], [2])], nomes, geral))).toEqual({});
    expect(destaques([])).toEqual({});
  });

  it('artilheiro empatado: quem vem primeiro no ranking', () => {
    const ps = [partida('2026-11-04', 'A', [1], [2], [{ jogadorId: 1, tipo: 'gol' }, { jogadorId: 2, tipo: 'gol' }])];
    expect(destaques(calcularRanking(ps, nomes, geral)).artilheiro?.jogadorId).toBe(1);
  });
});

describe('pontosDe', () => {
  it('vitória 3, empate 1, gol 1, assistência 1', () => {
    expect(pontosDe({ vitorias: 2, empates: 1, gols: 3, assistencias: 1 })).toBe(11);
    expect(pontosDe({ vitorias: 0, empates: 0, gols: 0, assistencias: 0 })).toBe(0);
  });
});

describe('historicoDoJogador', () => {
  it('uma linha por quarta, mais recente primeiro, com as partidas da noite em ordem', () => {
    const p1 = partida('2026-11-04', 'A', [1], [2], [{ jogadorId: 1, tipo: 'gol' }], new Date('2026-11-04T23:40:00Z'));
    const p2 = partida('2026-11-04', 'empate', [3], [1], [], new Date('2026-11-04T23:55:00Z'), ['verde', 'azul']);
    const p3 = partida('2026-11-11', 'B', [1], [2], [{ jogadorId: 1, tipo: 'assistencia' }, { jogadorId: 2, tipo: 'gol' }]);
    // fora de ordem de propósito: dentro da noite, a mais antiga primeiro
    const ps = [p2, p3, p1];
    expect(historicoDoJogador(ps, 1)).toEqual([
      {
        peladaData: '2026-11-11', jogos: 1, vitorias: 0, empates: 0, derrotas: 1, gols: 0, assistencias: 1,
        partidas: [
          { partidaId: p3.id, corDoTime: 'azul', corAdversario: 'laranja', placarTime: 0, placarAdversario: 1, resultado: 'D', gols: 0, assistencias: 1 },
        ],
      },
      {
        peladaData: '2026-11-04', jogos: 2, vitorias: 1, empates: 1, derrotas: 0, gols: 1, assistencias: 0,
        partidas: [
          { partidaId: p1.id, corDoTime: 'azul', corAdversario: 'laranja', placarTime: 1, placarAdversario: 0, resultado: 'V', gols: 1, assistencias: 0 },
          { partidaId: p2.id, corDoTime: 'azul', corAdversario: 'verde', placarTime: 0, placarAdversario: 0, resultado: 'E', gols: 0, assistencias: 0 },
        ],
      },
    ]);
    expect(historicoDoJogador(ps, 99)).toEqual([]);
  });

  it('placar soma só os gols de quem estava no elenco de cada lado', () => {
    const p = partida('2026-11-04', 'A', [1, 3], [2], [
      { jogadorId: 1, tipo: 'gol' },
      { jogadorId: 3, tipo: 'gol' },
      { jogadorId: 2, tipo: 'gol' },
      { jogadorId: 9, tipo: 'gol' },
    ]);
    const [q] = historicoDoJogador([p], 2);
    expect(q.partidas[0]).toMatchObject({ corDoTime: 'laranja', corAdversario: 'azul', placarTime: 1, placarAdversario: 2, resultado: 'D', gols: 1 });
  });
});
