import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EstadoDoRobo } from '@/robo/agenda';
import { aposEnvio, gravarEstado, lerEstado, nomeDoGrupo, pastaDoRobo } from '@/robo/estado';

const foto = { dataQuarta: '2026-11-11', estadoManual: null, jogadores: { 1: { nome: 'Ana', onde: 'confirmado' as const, tipo: 'M' as const } } };
const cheio: EstadoDoRobo = {
  ultimo: { quando: '2026-11-09T17:00:12.000Z', rodada: '2026-11-09T17:00:00.000Z', tipo: 'abertura', foto },
  aberturaEnviada: '2026-11-11',
  grupoId: '120363000000000000@g.us',
  grupoNome: 'Pelada 3.0',
};

let pasta: string;
let arquivo: string;
beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'robo-estado-'));
  arquivo = join(pasta, 'estado.json');
});
afterEach(() => rmSync(pasta, { recursive: true, force: true }));

describe('estado do robô', () => {
  it('gravar e ler devolve o mesmo objeto', () => {
    gravarEstado(arquivo, cheio);
    expect(lerEstado(arquivo)).toEqual(cheio);
  });

  it('arquivo inexistente: estado vazio', () => {
    expect(lerEstado(arquivo)).toEqual({ ultimo: null, aberturaEnviada: null, grupoId: null, grupoNome: null });
  });

  it('cria a pasta se ainda não existe', () => {
    const fundo = join(pasta, 'a', 'b', 'estado.json');
    gravarEstado(fundo, cheio);
    expect(lerEstado(fundo)).toEqual(cheio);
  });

  it('estado antigo sem grupoNome: lê como null', () => {
    writeFileSync(arquivo, JSON.stringify({ ultimo: null, aberturaEnviada: null, grupoId: 'g@g.us' }));
    expect(lerEstado(arquivo).grupoNome).toBeNull();
  });

  it('JSON corrompido: erro claro com o caminho, sem zerar em silêncio', () => {
    writeFileSync(arquivo, '{"ultimo": nu');
    expect(() => lerEstado(arquivo)).toThrow(/corrompido[\s\S]*estado\.json/);
    expect(readFileSync(arquivo, 'utf8')).toBe('{"ultimo": nu');
  });

  it('JSON válido mas que não é um estado (lista, texto): erro claro', () => {
    writeFileSync(arquivo, '[1,2]');
    expect(() => lerEstado(arquivo)).toThrow(/corrompido/);
    writeFileSync(arquivo, '"oi"');
    expect(() => lerEstado(arquivo)).toThrow(/corrompido/);
  });

  it('gravação atômica: escreve num temporário e renomeia (nenhum resto na pasta)', () => {
    gravarEstado(arquivo, cheio);
    gravarEstado(arquivo, { ...cheio, grupoId: 'outro@g.us' });
    expect(readdirSync(pasta)).toEqual(['estado.json']);
    expect(lerEstado(arquivo).grupoId).toBe('outro@g.us');
  });

  it('gravação que falha no meio não estraga o arquivo que já existia', () => {
    gravarEstado(arquivo, cheio);
    const ruim = { ...cheio, grupoId: BigInt(10) } as unknown as EstadoDoRobo; // BigInt: JSON.stringify lança
    expect(() => gravarEstado(arquivo, ruim)).toThrow();
    expect(lerEstado(arquivo)).toEqual(cheio);
    expect(readdirSync(pasta)).toEqual(['estado.json']);
  });
});

describe('aposEnvio', () => {
  const agora = new Date('2026-11-09T17:00:40.000Z'); // segunda 14:00:40 em Recife
  const vazio: EstadoDoRobo = { ultimo: null, aberturaEnviada: null, grupoId: 'g@g.us' };

  it('abertura: grava o último envio (com a rodada :00/:30) e a semana anunciada, mantendo o grupo', () => {
    expect(aposEnvio(vazio, agora, 'abertura', foto)).toEqual({
      ultimo: { quando: agora.toISOString(), rodada: '2026-11-09T17:00:00.000Z', tipo: 'abertura', foto },
      aberturaEnviada: '2026-11-11',
      grupoId: 'g@g.us',
    });
  });

  it('outros tipos não mexem em aberturaEnviada', () => {
    const antes = { ...vazio, aberturaEnviada: '2026-11-04' };
    const depois = aposEnvio(antes, agora, 'primeira', foto);
    expect(depois.aberturaEnviada).toBe('2026-11-04');
    expect(depois.ultimo?.tipo).toBe('primeira');
  });
});

describe('pastaDoRobo', () => {
  it('usa PELADA_ROBO_DIR quando definido, senão a pasta do usuário', () => {
    expect(pastaDoRobo({ PELADA_ROBO_DIR: '/tmp/x' }, '/Users/u')).toBe('/tmp/x');
    expect(pastaDoRobo({}, '/Users/u')).toBe('/Users/u/Library/Application Support/PeladaRobo');
  });
});

describe('nomeDoGrupo', () => {
  it('mostra o nome guardado no configurar', () => {
    expect(nomeDoGrupo(cheio)).toBe('"Pelada 3.0"');
    expect(nomeDoGrupo({ ...cheio, grupoNome: 'Teste robô' })).toBe('"Teste robô"');
    expect(nomeDoGrupo({ ...cheio, grupoNome: null })).toMatch(/120363000000000000@g\.us.*robo:configurar/);
    expect(nomeDoGrupo({ ...cheio, grupoId: null })).toMatch(/nenhum grupo/);
  });
});
