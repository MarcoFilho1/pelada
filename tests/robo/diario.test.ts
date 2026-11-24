import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { limparDiario, registrarConversa, type EntradaDoDiario } from '@/robo/diario';

const pasta = () => mkdtempSync(join(tmpdir(), 'diario-'));
const entrada = (quando: string, recebido = 'oi'): EntradaDoDiario => ({ quando, onde: 'grupo', quem: 'Caio', recebido, enviado: ['opa'] });

describe('diário de conversas', () => {
  it('registra uma linha por conversa no arquivo do dia', () => {
    const p = pasta();
    const a = entrada('2026-11-24T14:00:00.000Z', 'um');
    const b = { ...entrada('2026-11-24T15:00:00.000Z', 'dois'), onde: 'privado' as const, erro: 'caiu' };
    registrarConversa(p, a);
    registrarConversa(p, b);
    const linhas = readFileSync(join(p, '2026-11-24.jsonl'), 'utf8').trim().split('\n');
    expect(linhas.map((l) => JSON.parse(l))).toEqual([a, b]);
  });

  it('usa o dia de Recife', () => {
    const p = pasta();
    registrarConversa(p, entrada('2026-11-25T01:30:00.000Z'));
    expect(readdirSync(p)).toEqual(['2026-11-24.jsonl']);
  });

  it('não lança se a pasta não puder ser criada', () => {
    const p = pasta();
    writeFileSync(join(p, 'arquivo'), 'x');
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => registrarConversa(join(p, 'arquivo', 'dentro'), entrada('2026-11-24T14:00:00.000Z'))).not.toThrow();
    erro.mockRestore();
  });

  it('apaga só os arquivos com mais de 7 dias', () => {
    const p = pasta();
    for (const n of ['2026-11-16.jsonl', '2026-11-17.jsonl', '2026-11-24.jsonl', 'notas.txt']) writeFileSync(join(p, n), '');
    expect(limparDiario(p, new Date('2026-11-24T12:00:00-03:00'))).toEqual(['2026-11-16.jsonl']);
    expect(readdirSync(p).sort()).toEqual(['2026-11-17.jsonl', '2026-11-24.jsonl', 'notas.txt']);
  });

  it('limpar uma pasta que não existe não lança', () => {
    expect(limparDiario(join(pasta(), 'nao-existe'), new Date())).toEqual([]);
  });
});
