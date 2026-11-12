import { describe, expect, it } from 'vitest';
import { elencosDaPrevia, lerTimesColados, limparLinha, previaDosTimes, TEXTO_2_A_4_TIMES, trocarNomeNaLinha } from '@/domain/importarTimes';

const PEPE = `Pelada 04/11 - 20:30-22:30

Time 1 (12.0)
1. Ronaldo 4.5
2. Josa 3.5
3. Marquinho 3.0
4. Jonas 1.0

Time 2 (11.5)
1. Rodrigo 4.0
2. Caio 3,5
3. Luiz 2.0
4. COMPLETE 2.0
`;

const nomes = (r: ReturnType<typeof lerTimesColados>) => {
  if (!r.ok) throw new Error(r.erro);
  return r.times.map((t) => [t.nomes.map((n) => n.nome), t.completes]);
};

describe('lerTimesColados', () => {
  it('formato do Pepe: "Time N (soma)" abre o time, numeração e nota saem, o cabeçalho da pelada é ignorado', () => {
    expect(nomes(lerTimesColados(PEPE))).toEqual([
      [['Ronaldo', 'Josa', 'Marquinho', 'Jonas'], []],
      [['Rodrigo', 'Caio', 'Luiz'], [2]],
    ]);
  });

  it('guarda a linha de cada nome (para trocar pela sugestão)', () => {
    const r = lerTimesColados(PEPE);
    if (!r.ok) throw new Error();
    const linhas = PEPE.split('\n');
    expect(linhas[r.times[0].nomes[1].linha]).toBe('2. Josa 3.5');
  });

  it('sem "Time": linhas em branco separam os times; aceita "N -", "N)", vírgula na nota e nome sem nota', () => {
    const txt = 'Ana 3,5\nBeto\n\n\n1) Caio 4\n2 - Davi Lima 2,5\n\n- João Pedro 3.0\n• Edu';
    expect(nomes(lerTimesColados(txt))).toEqual([
      [['Ana', 'Beto'], []],
      [['Caio', 'Davi Lima'], []],
      [['João Pedro', 'Edu'], []],
    ]);
  });

  it('nota entre parênteses no jogador não abre time', () => {
    expect(nomes(lerTimesColados('Time 1\nAna (4,0)\nBeto (3.5)\nTime 2\nCaio (2)'))).toEqual([
      [['Ana', 'Beto'], []],
      [['Caio'], []],
    ]);
  });

  it('"time" minúsculo, sem número e sem linha em branco entre os times', () => {
    expect(nomes(lerTimesColados('time\nAna\nBeto\nTIME 2\nCaio\nDavi'))).toEqual([
      [['Ana', 'Beto'], []],
      [['Caio', 'Davi'], []],
    ]);
  });

  it('COMPLETE em qualquer caixa vira vaga; sem nota é 3,0; nota fora de 0–5 ou fora do passo 0,5 é erro', () => {
    expect(nomes(lerTimesColados('Time 1\nAna\ncomplete\nTime 2\nBeto\nComplete 3,5'))).toEqual([
      [['Ana'], [3]],
      [['Beto'], [3.5]],
    ]);
    expect(lerTimesColados('Time 1\nAna\nCOMPLETE 7\nTime 2\nBeto')).toEqual({ ok: false, erro: 'Nota do COMPLETE inválida: 7. Use de 0 a 5, de 0,5 em 0,5.' });
    expect(lerTimesColados('Time 1\nAna\nCOMPLETE 3,2\nTime 2\nBeto')).toMatchObject({ ok: false });
  });

  it('ignora linhas de cabeçalho e de conta (data, hora, ":" e "?")', () => {
    const zap = '🎲 Times sorteados:\n\n🔵 Azul (7,0)\n- Ana 4,0\n- Beto 3,0\n\n🟠 Laranja (7,0)\n- Caio 4,0\n- COMPLETE 3,0\n\nDiferença: 0,0\nConfirma? Responda *sim* em até 10 minutos ✅';
    expect(nomes(lerTimesColados(zap))).toEqual([
      [['Ana', 'Beto'], []],
      [['Caio'], [3]],
    ]);
  });

  it('1 ou 5 times: "Cole de 2 a 4 times."; vazio também', () => {
    expect(lerTimesColados('Time 1\nAna\nBeto')).toEqual({ ok: false, erro: TEXTO_2_A_4_TIMES });
    expect(lerTimesColados('A\n\nB\n\nC\n\nD\n\nE')).toEqual({ ok: false, erro: TEXTO_2_A_4_TIMES });
    expect(lerTimesColados('   \n')).toEqual({ ok: false, erro: TEXTO_2_A_4_TIMES });
    expect(TEXTO_2_A_4_TIMES).toBe('Cole de 2 a 4 times.');
  });

  it('time só de COMPLETE ou com mais de 4 contando o COMPLETE: erro', () => {
    expect(lerTimesColados('Time 1\nCOMPLETE\nTime 2\nBeto')).toEqual({ ok: false, erro: 'Cada time precisa de pelo menos um jogador.' });
    expect(lerTimesColados('Time 1\nA\nB\nC\nD\nCOMPLETE\nTime 2\nBeto')).toEqual({ ok: false, erro: 'Time com COMPLETE fecha em 4: tire um COMPLETE do time 1.' });
  });
});

describe('lerTimesColados: o que vem do WhatsApp', () => {
  it('"(?)", "(M)" e "(D)" saem antes de classificar: "Bia (?)" é a Bia', () => {
    expect(nomes(lerTimesColados('Time 1\nBia (?)\nAna (M)\nTime 2\nCaio (D) 3,5\nDavi'))).toEqual([
      [['Bia', 'Ana'], []],
      [['Caio', 'Davi'], []],
    ]);
  });

  it('cópia de várias mensagens: o prefixo "[data, hora] Nome:" sai e a linha continua valendo', () => {
    const txt = '[04/11, 20:31] Pepe: Time 1\n[04/11, 20:31] Pepe: 1. Ana\n[04/11, 20:31] Pepe: 2. Beto 3.0\n[04/11, 20:32] Pepe: Time 2\n[04/11, 20:32] Pepe: 1. Caio';
    expect(nomes(lerTimesColados(txt))).toEqual([
      [['Ana', 'Beto'], []],
      [['Caio'], []],
    ]);
  });

  it('":" só derruba hora ou rótulo no começo; "?" só no fim da linha; linhas ignoradas vêm listadas', () => {
    const r = lerTimesColados('Pelada 04/11 - 20:30-22:30\nTimes sorteados:\nTime 1\nAna\nBeto\nDiferença: 0,5\nTime 2\nCaio\nQuem paga a quadra?\nDavi');
    expect(nomes(r)).toEqual([
      [['Ana', 'Beto'], []],
      [['Caio', 'Davi'], []],
    ]);
    expect(r.ok && r.ignoradas).toEqual(['Pelada 04/11 - 20:30-22:30', 'Times sorteados:', 'Diferença: 0,5', 'Quem paga a quadra?']);
  });

  it('frase comprida no fim (a da proposta do robô) é ignorada e listada, não vira jogador', () => {
    const r = lerTimesColados('Time 1\nAna\nTime 2\nBeto\n\nConfirma? Responda *sim* em até 10 minutos ✅');
    expect(nomes(r)).toEqual([
      [['Ana'], []],
      [['Beto'], []],
    ]);
    expect(r.ok && r.ignoradas).toEqual(['Confirma? Responda *sim* em até 10 minutos ✅']);
  });

  it('negrito/itálico/riscado e emoji: "*Time 1 (12.0)*" e "⚽ Time 2" abrem times; "🔥 Ana" e "Duda 😂" são os nomes', () => {
    expect(nomes(lerTimesColados('*Time 1 (12.0)*\n1. 🔥 Ana 4.5\n2. _Beto_\n⚽ Time 2\n- Duda 😂 3,0\n- ~Caio~'))).toEqual([
      [['Ana', 'Beto'], []],
      [['Duda', 'Caio'], []],
    ]);
  });

  it('limparLinha junta espaços repetidos e tira emoji com seletor de variação', () => {
    expect(limparLinha('  ❤️  Ana   Paula  *3,5* ')).toBe('Ana Paula 3,5');
  });
});

describe('trocarNomeNaLinha ("Você quis dizer X?")', () => {
  it('troca só o nome, mantendo numeração e nota', () => {
    expect(trocarNomeNaLinha('Time 1\n2. Marquino 3.5', 1, 'Marquino', 'Marquinho')).toBe('Time 1\n2. Marquinho 3.5');
  });
  it('tolera espaços repetidos e formatação entre as palavras do nome escrito', () => {
    expect(trocarNomeNaLinha('Time 1\n1. Joao   Pedr 3.0', 1, 'Joao Pedr', 'João Pedro')).toBe('Time 1\n1. João Pedro 3.0');
    expect(trocarNomeNaLinha('x\n*Joao* _Pedr_', 1, 'Joao Pedr', 'João Pedro')).toBe('x\n*João Pedro_');
  });
  it('sem achar o texto, a linha vira o nome novo; linha fora do texto não muda nada', () => {
    expect(trocarNomeNaLinha('a\nzzz', 1, 'Marquino', 'Marquinho')).toBe('a\nMarquinho');
    expect(trocarNomeNaLinha('a', 5, 'x', 'y')).toBe('a');
  });
  it('o nome lido do texto, trocado de volta no texto, casa na prévia', () => {
    const texto = 'Time 1\n1.  🔥 Marquino   3.5\nTime 2\nCaio';
    const r = previaDosTimes(texto, [{ id: 1, nome: 'Marquinho', nota: 3 }, { id: 2, nome: 'Caio', nota: 3 }]);
    if (!r.ok) throw new Error(r.erro);
    const n = r.previa.times[0].nomes[0];
    expect(n).toMatchObject({ tipo: 'nao_achei', sugestao: 'Marquinho' });
    const novo = trocarNomeNaLinha(texto, n.linha, n.escrito, 'Marquinho');
    const de = previaDosTimes(novo, [{ id: 1, nome: 'Marquinho', nota: 3 }, { id: 2, nome: 'Caio', nota: 3 }]);
    expect(de.ok && de.previa.pronto).toBe(true);
  });
});

describe('previaDosTimes (nomes colados → jogadores ativos)', () => {
  const ativos = [
    { id: 1, nome: 'Ronaldo', nota: 4.5 },
    { id: 2, nome: 'Josafá', nota: 3.5 },
    { id: 3, nome: 'Marquinho', nota: 3 },
    { id: 4, nome: 'Jonas', nota: 1 },
    { id: 5, nome: 'Rodrigo', nota: 4 },
    { id: 6, nome: 'Caio', nota: 3.5 },
    { id: 7, nome: 'Luiz', nota: 2 },
    { id: 8, nome: 'Pedro', nota: 3 },
    { id: 9, nome: 'Pepe', nota: 4 },
  ];

  it('nome inteiro (sem acento/caixa) e começo do nome casam; a nota é a do cadastro', () => {
    const r = previaDosTimes('Time 1\nronaldo 1.0\nJosa\nTime 2\nCAIO\nLuiz 5', ativos);
    if (!r.ok) throw new Error(r.erro);
    expect(r.previa.pronto).toBe(true);
    expect(r.previa.times[0].nomes).toEqual([
      expect.objectContaining({ escrito: 'ronaldo', tipo: 'ok', jogador: { id: 1, nome: 'Ronaldo', nota: 4.5 }, repetido: false }),
      expect.objectContaining({ escrito: 'Josa', tipo: 'ok', jogador: { id: 2, nome: 'Josafá', nota: 3.5 } }),
    ]);
    expect(elencosDaPrevia(r.previa)).toEqual({ elencos: [[1, 2], [6, 7]], completes: [[], []] });
  });

  it('sem cadastro: não pronto, com sugestão parecida; começo ambíguo: as opções', () => {
    const r = previaDosTimes('Time 1\nRonaldo\nMarquino\nTime 2\nPe\nZé', ativos);
    if (!r.ok) throw new Error(r.erro);
    expect(r.previa.pronto).toBe(false);
    expect(r.previa.times[0].nomes[1]).toMatchObject({ escrito: 'Marquino', tipo: 'nao_achei', sugestao: 'Marquinho', linha: 2 });
    expect(r.previa.times[1].nomes[0]).toMatchObject({ escrito: 'Pe', tipo: 'varios', opcoes: ['Pedro', 'Pepe'] });
    expect(r.previa.times[1].nomes[1]).toMatchObject({ escrito: 'Zé', tipo: 'nao_achei', sugestao: null });
  });

  it('o mesmo jogador duas vezes: os dois marcados como repetidos e não pronto', () => {
    const r = previaDosTimes('Time 1\nRonaldo\nCaio\nTime 2\nronaldo\nLuiz', ativos);
    if (!r.ok) throw new Error(r.erro);
    expect(r.previa.pronto).toBe(false);
    expect(r.previa.times.flatMap((t) => t.nomes).filter((n) => n.tipo === 'ok' && n.repetido).map((n) => n.escrito)).toEqual(['Ronaldo', 'ronaldo']);
  });

  it('COMPLETE vai para os completes de cada time', () => {
    const r = previaDosTimes(PEPE.replace('Josa', 'Josafá'), ativos);
    if (!r.ok) throw new Error(r.erro);
    expect(r.previa.pronto).toBe(true);
    expect(elencosDaPrevia(r.previa)).toEqual({ elencos: [[1, 2, 3, 4], [5, 6, 7]], completes: [[], [2]] });
  });

  it('erro de leitura passa adiante', () => {
    expect(previaDosTimes('Ana', ativos)).toEqual({ ok: false, erro: TEXTO_2_A_4_TIMES });
  });
});
