import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores } from '@/db/schema';
import { acharJogador, mexerNaLista } from '@/robo/lista-zap';
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

  it('mais de um começa com o texto: todos; nenhum: null', () => {
    expect(acharJogador('pe', js)).toEqual({ varios: [{ nome: 'Pedro' }, { nome: 'Pepe' }] });
    expect(acharJogador('zé', js)).toBeNull();
    expect(acharJogador('', js)).toBeNull();
  });
});

describe('adicionar', () => {
  it('com vaga entra direto na lista', async () => {
    await criar(['Pepe']);
    expect(await mexerNaLista(db, 'adicionar', 'pepe', TERCA)).toEqual({ texto: 'Pepe entrou na lista.', mudou: true });
    const e = await estadoDaSemana(db, TERCA);
    expect(e.principal.map((i) => i.nome)).toEqual(['Pepe']);
  });

  it('lista cheia: vai para a fila com a posição', async () => {
    await listaCheia();
    await criar(['Caio', 'Davi']);
    expect(await mexerNaLista(db, 'adicionar', 'Caio', TERCA)).toEqual({ texto: 'Caio entrou na fila (1º).', mudou: true });
    expect(await mexerNaLista(db, 'adicionar', 'davi', TERCA)).toEqual({ texto: 'Davi entrou na fila (2º).', mudou: true });
  });

  it('não cadastrado ou desativado: pede para um admin cadastrar', async () => {
    await criar(['Velho'], { ativo: false });
    expect(await mexerNaLista(db, 'adicionar', 'Zé', TERCA)).toEqual({ texto: 'Zé não está cadastrado. Peça para um admin cadastrar no site.', mudou: false });
    expect((await mexerNaLista(db, 'adicionar', 'Velho', TERCA)).texto).toBe('Velho não está cadastrado. Peça para um admin cadastrar no site.');
  });

  it('quem já está na lista ou na fila', async () => {
    await listaCheia();
    await criar(['Caio']);
    await mexerNaLista(db, 'adicionar', 'Caio', TERCA);
    expect(await mexerNaLista(db, 'adicionar', 'M01', TERCA)).toEqual({ texto: 'M01 já está na lista.', mudou: false });
    expect(await mexerNaLista(db, 'adicionar', 'caio', TERCA)).toEqual({ texto: 'Caio já está na fila.', mudou: false });
  });

  it('nome que bate com mais de um: pede o nome inteiro', async () => {
    await criar(['Pepe', 'Pedro']);
    expect(await mexerNaLista(db, 'adicionar', 'pe', TERCA)).toEqual({
      texto: 'Tem mais de um jogador com esse nome: Pedro e Pepe. Mande o nome inteiro.',
      mudou: false,
    });
  });

  it('pelo começo do nome', async () => {
    await criar(['Pedro Henrique', 'Caio']);
    expect((await mexerNaLista(db, 'adicionar', 'ped', TERCA)).texto).toBe('Pedro Henrique entrou na lista.');
  });

  it('lista fechada: recusa com a mensagem do site', async () => {
    await criar(['Pepe']);
    const p = await obterPeladaDaSemana(db, TERCA);
    await definirEstadoManual(db, p.id, 'fechada');
    expect(await mexerNaLista(db, 'adicionar', 'Pepe', TERCA)).toEqual({ texto: 'A lista está fechada.', mudou: false });
  });

  it('pelada cancelada: recusa com a mensagem do site', async () => {
    await criar(['Pepe']);
    const p = await obterPeladaDaSemana(db, TERCA);
    await definirEstadoManual(db, p.id, 'cancelada');
    expect((await mexerNaLista(db, 'adicionar', 'Pepe', TERCA)).texto).toBe('A pelada desta semana foi cancelada.');
  });

  it('mensalista que saiu e volta com vaga entra com a marca M (regra do site)', async () => {
    const [m] = await criar(['Mário']);
    await definirMensalistas(db, '2026-11', [m]);
    await mexerNaLista(db, 'remover', 'Mário', TERCA);
    expect((await mexerNaLista(db, 'adicionar', 'mario', TERCA)).texto).toBe('Mário entrou na lista.');
    const e = await estadoDaSemana(db, TERCA);
    expect(e.principal[0]).toMatchObject({ nome: 'Mário', marca: 'M' });
  });
});

describe('confirmar', () => {
  it('confirma quem está pendente na lista; a segunda vez avisa', async () => {
    await listaCheia();
    expect(await mexerNaLista(db, 'confirmar', 'm01', TERCA)).toEqual({ texto: 'M01 confirmado.', mudou: true });
    expect((await estadoDaSemana(db, TERCA)).principal.find((i) => i.nome === 'M01')?.confirmado).toBe(true);
    expect(await mexerNaLista(db, 'confirmar', 'M01', TERCA)).toEqual({ texto: 'M01 já estava confirmado.', mudou: false });
  });

  it('quem não está na lista nem na fila', async () => {
    await criar(['Pepe']);
    expect(await mexerNaLista(db, 'confirmar', 'Pepe', TERCA)).toEqual({ texto: 'Pepe não está na lista.', mudou: false });
  });

  it('quem está na fila não confirma (regra do site)', async () => {
    await listaCheia();
    await criar(['Caio']);
    await mexerNaLista(db, 'adicionar', 'Caio', TERCA);
    expect(await mexerNaLista(db, 'confirmar', 'Caio', TERCA)).toEqual({
      texto: 'Só quem está na lista principal e ainda não confirmou pode confirmar.',
      mudou: false,
    });
  });

  it('mensalista depois das 14h de quarta: recusa (perdeu o prazo)', async () => {
    await listaCheia();
    await obterPeladaDaSemana(db, TERCA);
    const r = await mexerNaLista(db, 'confirmar', 'M01', QUARTA_TARDE);
    expect(r).toEqual({ texto: 'Só quem está na lista principal e ainda não confirmou pode confirmar.', mudou: false });
  });

  it('nome que bate com mais de um entre lista e fila', async () => {
    await criar(['Pepe', 'Pedro', 'Pedrinho']);
    await mexerNaLista(db, 'adicionar', 'Pepe', TERCA);
    await mexerNaLista(db, 'adicionar', 'Pedro', TERCA);
    // Pedrinho é cadastrado, mas não está na lista: não entra na conta.
    expect((await mexerNaLista(db, 'confirmar', 'pe', TERCA)).texto).toBe('Tem mais de um jogador com esse nome: Pepe e Pedro. Mande o nome inteiro.');
    expect((await mexerNaLista(db, 'confirmar', 'ped', TERCA)).texto).toBe('Pedro confirmado.');
  });
});

describe('remover', () => {
  it('tira da lista e da fila', async () => {
    await listaCheia();
    await criar(['Caio']);
    await mexerNaLista(db, 'adicionar', 'Caio', TERCA);
    expect(await mexerNaLista(db, 'remover', 'Caio', TERCA)).toEqual({ texto: 'Caio saiu da fila.', mudou: true });
    expect(await mexerNaLista(db, 'remover', 'M16', TERCA)).toEqual({ texto: 'M16 saiu da lista.', mudou: true });
    const e = await estadoDaSemana(db, TERCA);
    expect(e.principal.map((i) => i.nome)).not.toContain('M16');
    expect(e.fila).toEqual([]);
  });

  it('quem não está na lista', async () => {
    await criar(['Pepe']);
    expect(await mexerNaLista(db, 'remover', 'Pepe', TERCA)).toEqual({ texto: 'Pepe não está na lista.', mudou: false });
  });

  it('pelada cancelada: recusa com a mensagem do site', async () => {
    await listaCheia();
    const p = await obterPeladaDaSemana(db, TERCA);
    await definirEstadoManual(db, p.id, 'cancelada');
    expect(await mexerNaLista(db, 'remover', 'M01', TERCA)).toEqual({ texto: 'A pelada desta semana foi cancelada.', mudou: false });
  });
});
