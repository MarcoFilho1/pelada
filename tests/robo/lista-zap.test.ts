import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores } from '@/db/schema';
import { acharJogador, CALVINHO, levenshtein, mexerNaLista } from '@/robo/lista-zap';
import { definirMensalistas } from '@/server/mensalistas';
import { definirEstadoManual, obterPeladaDaSemana } from '@/server/pelada';
import { estadoDaSemana } from '@/server/presencas';
import { createTestDb } from '../helpers/db';

// Semana da quarta 11/11/2026: abre segunda 09/11 00:00, prazo dos mensalistas quarta 14:00.
const TERCA = new Date('2026-11-10T10:00:00-03:00');
const QUARTA_TARDE = new Date('2026-11-11T15:00:00-03:00');

let db: DB;

async function criar(nomes: string[], extra: Partial<typeof jogadores.$inferInsert> = {}): Promise<number[]> {
  const ids: number[] = [];
  for (const nome of nomes) {
    const [j] = await db.insert(jogadores).values({ nome, ...extra }).returning({ id: jogadores.id });
    ids.push(j.id);
  }
  return ids;
}

const nomes = (prefixo: string, n: number) => Array.from({ length: n }, (_, i) => `${prefixo}${String(i + 1).padStart(2, '0')}`);

/** 16 mensalistas em novembro (lista principal cheia). */
async function listaCheia() {
  const ms = await criar(nomes('M', 16));
  await definirMensalistas(db, '2026-11', ms);
  return ms;
}

beforeEach(async () => {
  db = await createTestDb();
});

describe('acharJogador (nome escrito no WhatsApp → jogador)', () => {
  const js = [{ nome: 'Ana' }, { nome: 'Ana Paula' }, { nome: 'João' }, { nome: 'Pedro' }, { nome: 'Pepe' }];

  it('nome inteiro, sem acento e maiúsculas, vence o começo de outro nome', () => {
    expect(acharJogador('ana', js)).toEqual({ jogador: { nome: 'Ana' } });
    expect(acharJogador('JOAO', js)).toEqual({ jogador: { nome: 'João' } });
    expect(acharJogador('ana  paula', js)).toEqual({ jogador: { nome: 'Ana Paula' } });
  });

  it('um só nome começa com o texto: esse', () => {
    expect(acharJogador('ped', js)).toEqual({ jogador: { nome: 'Pedro' } });
    expect(acharJogador('Jo', js)).toEqual({ jogador: { nome: 'João' } });
  });

  it('dois nomes inteiros iguais sem acento (João e Joao): ambíguo', () => {
    const dup = [{ nome: 'João' }, { nome: 'Joao' }, { nome: 'Joaquim' }];
    expect(acharJogador('joao', dup)).toEqual({ varios: [{ nome: 'João' }, { nome: 'Joao' }] });
  });

  it('começo do nome precisa de 2 letras; nome inteiro de qualquer tamanho vale', () => {
    expect(acharJogador('p', js)).toBeNull();
    expect(acharJogador('j', js)).toBeNull();
    expect(acharJogador('jo', js)).toEqual({ jogador: { nome: 'João' } });
    expect(acharJogador('l', [{ nome: 'L' }, { nome: 'Luiz' }])).toEqual({ jogador: { nome: 'L' } });
  });

  it('mais de um começa com o texto: todos; nenhum: null', () => {
    expect(acharJogador('pe', js)).toEqual({ varios: [{ nome: 'Pedro' }, { nome: 'Pepe' }] });
    expect(acharJogador('zé', js)).toBeNull();
    expect(acharJogador('', js)).toBeNull();
  });
});

describe('adicionar', () => {
  it('com vaga entra direto na lista', async () => {
    await criar(['Pepe']);
    expect(await mexerNaLista(db, 'adicionar', 'pepe', TERCA)).toEqual({ texto: '✅ Pepe entrou na lista!', mudou: true });
    const e = await estadoDaSemana(db, TERCA);
    expect(e.principal.map((i) => i.nome)).toEqual(['Pepe']);
  });

  it('lista cheia: vai para a fila com a posição', async () => {
    await listaCheia();
    await criar(['Caio', 'Davi']);
    expect(await mexerNaLista(db, 'adicionar', 'Caio', TERCA)).toEqual({ texto: '📝 Caio entrou na fila (1º).', mudou: true });
    expect(await mexerNaLista(db, 'adicionar', 'davi', TERCA)).toEqual({ texto: '📝 Davi entrou na fila (2º).', mudou: true });
  });

  it('não cadastrado ou desativado: pede para um admin cadastrar', async () => {
    await criar(['Velho'], { ativo: false });
    expect(await mexerNaLista(db, 'adicionar', 'Zé', TERCA)).toEqual({ texto: '🤔 Zé não está cadastrado. Peça para um admin cadastrar no site.', mudou: false });
    expect((await mexerNaLista(db, 'adicionar', 'Velho', TERCA)).texto).toBe('🤔 Velho não está cadastrado. Peça para um admin cadastrar no site.');
  });

  it('quem já está na lista ou na fila', async () => {
    await listaCheia();
    await criar(['Caio']);
    await mexerNaLista(db, 'adicionar', 'Caio', TERCA);
    expect(await mexerNaLista(db, 'adicionar', 'M01', TERCA)).toEqual({ texto: '👍 M01 já está na lista.', mudou: false });
    expect(await mexerNaLista(db, 'adicionar', 'caio', TERCA)).toEqual({ texto: '👍 Caio já está na fila.', mudou: false });
  });

  it('nome que bate com mais de um: pede o nome inteiro', async () => {
    await criar(['Pepe', 'Pedro']);
    expect(await mexerNaLista(db, 'adicionar', 'pe', TERCA)).toEqual({
      texto: '🤔 Tem mais de um jogador com esse nome: Pedro e Pepe. Mande o nome inteiro.',
      mudou: false,
    });
  });

  it('nome digitado comprido aparece cortado em 30 caracteres na resposta', async () => {
    const digitado = 'Fulano de Tal da Silva Sauro Neto';
    expect(digitado.length).toBeGreaterThan(30);
    expect((await mexerNaLista(db, 'adicionar', digitado, TERCA)).texto).toBe(`🤔 ${digitado.slice(0, 30)}… não está cadastrado. Peça para um admin cadastrar no site.`);
    expect((await mexerNaLista(db, 'remover', digitado, TERCA)).texto).toBe(`🤔 ${digitado.slice(0, 30)}… não está na lista.`);
  });

  it('dois cadastrados com o mesmo nome sem acento: pede o nome inteiro', async () => {
    await criar(['João', 'Joao']);
    expect((await mexerNaLista(db, 'adicionar', 'joão', TERCA)).texto).toMatch(/^🤔 Tem mais de um jogador com esse nome: (Joao e João|João e Joao)\. Mande o nome inteiro\.$/);
  });

  it('pelo começo do nome', async () => {
    await criar(['Pedro Henrique', 'Caio']);
    expect((await mexerNaLista(db, 'adicionar', 'ped', TERCA)).texto).toBe('✅ Pedro Henrique entrou na lista!');
  });

  it('lista fechada: recusa com a mensagem do site', async () => {
    await criar(['Pepe']);
    const p = await obterPeladaDaSemana(db, TERCA);
    await definirEstadoManual(db, p.id, 'fechada');
    expect(await mexerNaLista(db, 'adicionar', 'Pepe', TERCA)).toEqual({ texto: '⚠️ A lista está fechada.', mudou: false });
  });

  it('pelada cancelada: recusa com a mensagem do site', async () => {
    await criar(['Pepe']);
    const p = await obterPeladaDaSemana(db, TERCA);
    await definirEstadoManual(db, p.id, 'cancelada');
    expect((await mexerNaLista(db, 'adicionar', 'Pepe', TERCA)).texto).toBe('⚠️ A pelada desta semana foi cancelada.');
  });

  it('mensalista que saiu e volta com vaga entra com a marca M (regra do site)', async () => {
    const [m] = await criar(['Mário']);
    await definirMensalistas(db, '2026-11', [m]);
    await mexerNaLista(db, 'remover', 'Mário', TERCA);
    expect((await mexerNaLista(db, 'adicionar', 'mario', TERCA)).texto).toBe('✅ Mário entrou na lista!');
    const e = await estadoDaSemana(db, TERCA);
    expect(e.principal[0]).toMatchObject({ nome: 'Mário', marca: 'M' });
  });
});

describe('confirmar', () => {
  it('confirma quem está pendente na lista; a segunda vez avisa', async () => {
    await listaCheia();
    expect(await mexerNaLista(db, 'confirmar', 'm01', TERCA)).toEqual({ texto: '✅ M01 confirmado!', mudou: true });
    expect((await estadoDaSemana(db, TERCA)).principal.find((i) => i.nome === 'M01')?.confirmado).toBe(true);
    expect(await mexerNaLista(db, 'confirmar', 'M01', TERCA)).toEqual({ texto: '👍 M01 já estava confirmado.', mudou: false });
  });

  it('quem não está na lista nem na fila', async () => {
    await criar(['Pepe']);
    expect(await mexerNaLista(db, 'confirmar', 'Pepe', TERCA)).toEqual({ texto: '🤔 Pepe não está na lista.', mudou: false });
  });

  it('quem está na fila não confirma (regra do site)', async () => {
    await listaCheia();
    await criar(['Caio']);
    await mexerNaLista(db, 'adicionar', 'Caio', TERCA);
    expect(await mexerNaLista(db, 'confirmar', 'Caio', TERCA)).toEqual({
      texto: '⚠️ Só quem está na lista principal e ainda não confirmou pode confirmar.',
      mudou: false,
    });
  });

  it('mensalista depois das 14h de quarta: recusa (perdeu o prazo)', async () => {
    await listaCheia();
    await obterPeladaDaSemana(db, TERCA);
    const r = await mexerNaLista(db, 'confirmar', 'M01', QUARTA_TARDE);
    expect(r).toEqual({ texto: '⚠️ Só quem está na lista principal e ainda não confirmou pode confirmar.', mudou: false });
  });

  it('nome que bate com mais de um entre lista e fila', async () => {
    await criar(['Pepe', 'Pedro', 'Pedrinho']);
    await mexerNaLista(db, 'adicionar', 'Pepe', TERCA);
    await mexerNaLista(db, 'adicionar', 'Pedro', TERCA);
    // Pedrinho é cadastrado, mas não está na lista: não entra na conta.
    expect((await mexerNaLista(db, 'confirmar', 'pe', TERCA)).texto).toBe('🤔 Tem mais de um jogador com esse nome: Pepe e Pedro. Mande o nome inteiro.');
    expect((await mexerNaLista(db, 'confirmar', 'ped', TERCA)).texto).toBe('✅ Pedro confirmado!');
  });
});

describe('remover', () => {
  it('tira da lista e da fila', async () => {
    await listaCheia();
    await criar(['Caio']);
    await mexerNaLista(db, 'adicionar', 'Caio', TERCA);
    expect(await mexerNaLista(db, 'remover', 'Caio', TERCA)).toEqual({ texto: '👋 Caio saiu da fila.', mudou: true });
    expect(await mexerNaLista(db, 'remover', 'M16', TERCA)).toEqual({ texto: '👋 M16 saiu da lista.', mudou: true });
    const e = await estadoDaSemana(db, TERCA);
    expect(e.principal.map((i) => i.nome)).not.toContain('M16');
    expect(e.fila).toEqual([]);
  });

  it('quem não está na lista', async () => {
    await criar(['Pepe']);
    expect(await mexerNaLista(db, 'remover', 'Pepe', TERCA)).toEqual({ texto: '🤔 Pepe não está na lista.', mudou: false });
  });

  it('pelada cancelada: recusa com a mensagem do site', async () => {
    await listaCheia();
    const p = await obterPeladaDaSemana(db, TERCA);
    await definirEstadoManual(db, p.id, 'cancelada');
    expect(await mexerNaLista(db, 'remover', 'M01', TERCA)).toEqual({ texto: '⚠️ A pelada desta semana foi cancelada.', mudou: false });
  });
});

describe('brincadeira do calvinho (Jonas)', () => {
  const rng0 = () => 0;
  const rngFim = () => 0.999;

  it('confirmar, já confirmado e remover: variante do Jonas, achado por "jon" também', async () => {
    const [m] = await criar(['Jonas']);
    await definirMensalistas(db, '2026-11', [m]);
    const c = await mexerNaLista(db, 'confirmar', 'jon', TERCA, rng0);
    expect(c).toEqual({ texto: CALVINHO.confirmado[0], mudou: true });
    expect((await mexerNaLista(db, 'confirmar', 'jonas', TERCA, rng0)).texto).toBe(CALVINHO.jaConfirmado[0]);
    expect((await mexerNaLista(db, 'confirmar', 'jonas', TERCA, rngFim)).texto).toBe(CALVINHO.jaConfirmado[1]);
    const s = await mexerNaLista(db, 'remover', 'jonas', TERCA, rngFim);
    expect(s).toEqual({ texto: CALVINHO.saiu[2], mudou: true });
    expect((await mexerNaLista(db, 'remover', 'jonas', TERCA, rng0)).texto).toBe(CALVINHO.foraDaLista[0]);
    expect((await mexerNaLista(db, 'confirmar', 'jonas', TERCA, rng0)).texto).toBe(CALVINHO.foraDaLista[0]);
  });

  it('adicionar: lista, já na lista, fila com posição e já na fila', async () => {
    await listaCheia();
    await criar(['Jonas', 'Caio']);
    const f = await mexerNaLista(db, 'adicionar', 'jonas', TERCA, rng0);
    expect(f).toEqual({ texto: '📝 Calvinho na fila (1º)… aguenta firme, calvo 🙏', mudou: true });
    expect((await mexerNaLista(db, 'adicionar', 'jonas', TERCA, rng0)).texto).toBe(CALVINHO.jaNaFila[0]);
    await mexerNaLista(db, 'remover', 'M01', TERCA);
    await mexerNaLista(db, 'remover', 'jonas', TERCA, rng0);
    const l = await mexerNaLista(db, 'adicionar', 'jonas', TERCA, rngFim);
    expect(l).toEqual({ texto: CALVINHO.entrouNaLista[2], mudou: true });
    expect((await mexerNaLista(db, 'adicionar', 'jonas', TERCA, rng0)).texto).toBe(CALVINHO.jaNaLista[0]);
  });

  it('outros jogadores seguem com o texto normal', async () => {
    await criar(['Caio']);
    expect(await mexerNaLista(db, 'adicionar', 'Caio', TERCA, rng0)).toEqual({ texto: '✅ Caio entrou na lista!', mudou: true });
    expect((await mexerNaLista(db, 'remover', 'Caio', TERCA, rng0)).texto).toBe('👋 Caio saiu da lista.');
  });
});

describe('sugestão de nome parecido', () => {
  it('levenshtein', () => {
    expect(levenshtein('gabriel', 'gabrel')).toBe(1);
    expect(levenshtein('abc', 'xyz')).toBe(3);
    expect(levenshtein('', 'ab')).toBe(2);
  });
  it('adicionar: nome inteiro parecido', async () => {
    await criar(['Mateus Borges', 'Gabriel', 'Pedro']);
    expect(await mexerNaLista(db, 'adicionar', 'mateu borges', TERCA)).toEqual({ texto: '🤔 Não achei "mateu borges". Você quis dizer Mateus Borges?', mudou: false });
    expect((await mexerNaLista(db, 'adicionar', 'gabrel', TERCA)).texto).toBe('🤔 Não achei "gabrel". Você quis dizer Gabriel?');
    expect((await mexerNaLista(db, 'adicionar', 'borgs', TERCA)).texto).toBe('🤔 Não achei "borgs". Você quis dizer Mateus Borges?');
  });
  it('não age sobre a sugestão', async () => {
    await criar(['Gabriel']);
    await mexerNaLista(db, 'adicionar', 'gabrel', TERCA);
    const e = await estadoDaSemana(db, TERCA);
    expect(e.principal.length + e.fila.length).toBe(0);
  });
  it('nada parecido, curto demais ou empate: texto de sempre', async () => {
    await criar(['Gabriel', 'Gabriela', 'Pedro']);
    expect((await mexerNaLista(db, 'adicionar', 'Zézinho', TERCA)).texto).toBe('🤔 Zézinho não está cadastrado. Peça para um admin cadastrar no site.');
    expect((await mexerNaLista(db, 'adicionar', 'Xa', TERCA)).texto).toContain('não está');
    // "gabrie" é começo de dois: ambíguo (não é sugestão)
    expect((await mexerNaLista(db, 'adicionar', 'gabrie', TERCA)).texto).toContain('mais de um');
    // "gabrll": distância 2 de Gabriel e 3 de Gabriela → um só
    expect((await mexerNaLista(db, 'adicionar', 'gabrll', TERCA)).texto).toContain('Você quis dizer Gabriel?');
  });
  it('confirmar e remover sugerem entre quem está na lista ou fila', async () => {
    await criar(['Gabriel']);
    await criar(['Pedro']);
    await mexerNaLista(db, 'adicionar', 'Gabriel', TERCA);
    expect((await mexerNaLista(db, 'confirmar', 'gabrel', TERCA)).texto).toBe('🤔 Não achei "gabrel". Você quis dizer Gabriel?');
    expect((await mexerNaLista(db, 'remover', 'gabrel', TERCA)).mudou).toBe(false);
    // Pedro é cadastrado mas fora da lista: não é sugerido
    expect((await mexerNaLista(db, 'remover', 'pedr0', TERCA)).texto).toBe('🤔 pedr0 não está na lista.');
  });
  it('texto curto (menos de 5 letras) só sugere com 1 de diferença', async () => {
    await criar(['Ana', 'Beto']);
    expect((await mexerNaLista(db, 'adicionar', 'bia', TERCA)).texto).toBe('🤔 bia não está cadastrado. Peça para um admin cadastrar no site.');
    expect((await mexerNaLista(db, 'adicionar', 'anx', TERCA)).texto).toBe('🤔 Não achei "anx". Você quis dizer Ana?');
  });
  it('sobrenome sozinho pode sugerir o nome completo', async () => {
    await criar(['Mateus Borges']);
    expect((await mexerNaLista(db, 'adicionar', 'borjes', TERCA)).texto).toBe('🤔 Não achei "borjes". Você quis dizer Mateus Borges?');
  });
  it('eco de 30 caracteres na sugestão', async () => {
    await criar(['Maximiliano Fernandes de Albuquerque']);
    const digitado = 'Maximiliano Fernandes de Albukerque';
    expect((await mexerNaLista(db, 'adicionar', digitado, TERCA)).texto).toBe(`🤔 Não achei "${digitado.slice(0, 30)}…". Você quis dizer Maximiliano Fernandes de Albuquerque?`);
  });
});
