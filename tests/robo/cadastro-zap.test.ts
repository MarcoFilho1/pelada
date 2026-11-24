import { describe, expect, it } from 'vitest';
import { arrumarNome, lerCadastro, pedirNotas, respostaCadastro, TEXTO_COMO_CADASTRAR } from '@/robo/cadastro-zap';

describe('lerCadastro', () => {
  it('aceita nota com ponto ou vírgula', () => {
    expect(lerCadastro('Caio - 2.5')).toEqual([{ nome: 'Caio', nota: 2.5 }]);
    expect(lerCadastro('Caio - 2,5')).toEqual([{ nome: 'Caio', nota: 2.5 }]);
  });

  it('várias pessoas separadas só por espaço depois da nota', () => {
    expect(lerCadastro('Caio - 2.5 Joao - 2.5 Pedro - 2,5')).toEqual([
      { nome: 'Caio', nota: 2.5 },
      { nome: 'Joao', nota: 2.5 },
      { nome: 'Pedro', nota: 2.5 },
    ]);
  });

  it('vírgula, ponto e vírgula, "e" e quebra de linha entre as pessoas; nota inteira', () => {
    expect(lerCadastro('Caio 2,5, João 3; Pedro: 4 e Lucas nota 1.5\nMateus Borges - 3')).toEqual([
      { nome: 'Caio', nota: 2.5 },
      { nome: 'João', nota: 3 },
      { nome: 'Pedro', nota: 4 },
      { nome: 'Lucas', nota: 1.5 },
      { nome: 'Mateus Borges', nota: 3 },
    ]);
  });

  it('nota entre parênteses', () => {
    expect(lerCadastro('Caio (2,5), João (3)')).toEqual([
      { nome: 'Caio', nota: 2.5 },
      { nome: 'João', nota: 3 },
    ]);
  });

  it('vários nomes antes de uma nota dividem a nota', () => {
    expect(lerCadastro('Caio, Pedro e João - 2.5')).toEqual([
      { nome: 'Caio', nota: 2.5 },
      { nome: 'Pedro', nota: 2.5 },
      { nome: 'João', nota: 2.5 },
    ]);
  });

  it('"ambos", "todos", "os dois" antes da nota não viram jogador', () => {
    const lumoEFelipe = [
      { nome: 'Lumo', nota: 3 },
      { nome: 'Felipe', nota: 3 },
    ];
    expect(lerCadastro('Lumo e Felipe, ambos 3,0')).toEqual(lumoEFelipe);
    expect(lerCadastro('Lumo, Felipe, ambos com nota 3')).toEqual(lumoEFelipe);
    expect(lerCadastro('Lumo e Felipe ambos 3')).toEqual(lumoEFelipe);
    expect(lerCadastro('Lumo e Felipe\nAmbos - 3')).toEqual(lumoEFelipe);
    expect(lerCadastro('Lumo e Felipe, os dois com 3')).toEqual(lumoEFelipe);
    expect(lerCadastro('Lumo e Felipe, todos 3')).toEqual(lumoEFelipe);
  });

  it('sem nota: null (fica 3,0); nomes compostos sem vírgula ficam juntos', () => {
    expect(lerCadastro('Caio, Mateus Borges')).toEqual([
      { nome: 'Caio', nota: null },
      { nome: 'Mateus Borges', nota: null },
    ]);
    expect(lerCadastro('Caio - 2,5, Pedro')).toEqual([
      { nome: 'Caio', nota: 2.5 },
      { nome: 'Pedro', nota: null },
    ]);
  });

  it('nome em minúsculas ganha maiúsculas; nota fora da regra vem como foi escrita', () => {
    expect(lerCadastro('joão da silva - 7')).toEqual([{ nome: 'João da Silva', nota: 7 }]);
  });

  it('sem nomes: vazio', () => {
    expect(lerCadastro('')).toEqual([]);
    expect(lerCadastro(' - 2,5 ')).toEqual([]);
  });
});

describe('arrumarNome', () => {
  it('só mexe em nome todo minúsculo', () => {
    expect(arrumarNome('caio')).toBe('Caio');
    expect(arrumarNome('maria das dores')).toBe('Maria das Dores');
    expect(arrumarNome('McFly')).toBe('McFly');
  });
});

describe('respostaCadastro', () => {
  const vazio = { criados: [], jaExistiam: [], notaInvalida: [], nomeComprido: [] };

  it('uma pessoa cadastrada', () => {
    expect(respostaCadastro({ ...vazio, criados: [{ id: 1, nome: 'Caio', nota: 2.5 }] })).toEqual({ texto: '✅ Cadastrado: Caio (2,5).', mudou: true });
  });

  it('várias, com já cadastrado, nota inválida e nome comprido', () => {
    const r = respostaCadastro({
      criados: [
        { id: 1, nome: 'Caio', nota: 2.5 },
        { id: 2, nome: 'João', nota: 3 },
      ],
      jaExistiam: ['Pedro'],
      notaInvalida: [{ nome: 'Lucas', nota: 2.3 }],
      nomeComprido: ['x'.repeat(70)],
    });
    expect(r.mudou).toBe(true);
    expect(r.texto).toBe(
      [
        '✅ Cadastrados: Caio (2,5) e João (3,0).',
        '👍 Já estava cadastrado: Pedro.',
        '⚠️ Nota inválida para Lucas: 2,3. Use de 0 a 5, de 0,5 em 0,5.',
        '⚠️ Nome muito comprido: 1 pessoa não cadastrada.',
      ].join('\n'),
    );
  });

  it('ninguém cadastrado: não mudou', () => {
    expect(respostaCadastro({ ...vazio, jaExistiam: ['Pedro', 'Caio'] })).toEqual({ texto: '👍 Já estavam cadastrados: Pedro e Caio.', mudou: false });
    expect(respostaCadastro(vazio)).toEqual({ texto: TEXTO_COMO_CADASTRAR, mudou: false });
  });
});

describe('pedirNotas', () => {
  it('um nome e vários (exemplo com até dois)', () => {
    expect(pedirNotas(['Pedro'])).toBe('✍️ Faltou a nota de Pedro. Mande de novo com a nota, assim: *cadastrar Pedro - 2,5*');
    expect(pedirNotas(['Pedro', 'João', 'Lucas'])).toBe('✍️ Faltou a nota de Pedro, João e Lucas. Mande de novo com a nota, assim: *cadastrar Pedro - 2,5, João - 3*');
  });
});
