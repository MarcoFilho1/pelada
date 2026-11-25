import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { gravarManifesto, lerManifesto, limparManifesto } from '@/server/atualizacao';
import { createTestDb } from '../helpers/db';

const item = { versao: '2026.11.24-abc1234', numero: 1795556316, url: 'https://arquivos.exemplo/robo-x7Kq.mjs', sha256: 'a'.repeat(64), assinatura: 'MEUCIQ==' };

describe('limparManifesto', () => {
  it('aceita robô, app ou os dois, e joga fora o que não conhece', () => {
    expect(limparManifesto({ robo: item })).toEqual({ robo: item });
    expect(limparManifesto({ robo: { ...item, intruso: 1 }, app: item, app_minimo: 3, outro: 'x' })).toEqual({ robo: item, app: item, app_minimo: 3 });
  });

  it('guarda as novidades do item, limpas (25/11: o site jogava o campo fora e o app não recebia)', () => {
    const novidades = ['  O robô aprende com a resenha.  ', '', 7, 'x'.repeat(300), ...Array.from({ length: 10 }, (_, i) => `linha ${i}`)];
    const r = limparManifesto({ robo: { ...item, novidades }, app: item });
    expect(r?.robo?.novidades).toHaveLength(8);
    expect(r?.robo?.novidades?.[0]).toBe('O robô aprende com a resenha.');
    expect(r?.robo?.novidades?.[1]).toHaveLength(200);
    expect(r?.app).toEqual(item);
    expect(limparManifesto({ robo: { ...item, novidades: 'texto' } })).toEqual({ robo: item });
  });

  it('recusa o que não é manifesto', () => {
    for (const ruim of [null, 'x', [], {}, { robo: null }, { robo: { ...item, url: 'http://sem-https/x' } }, { robo: { ...item, sha256: 'curto' } }, { robo: { ...item, numero: -1 } }, { robo: { ...item, versao: '../fora' } }, { robo: item, app: { ...item, assinatura: '' } }]) {
      expect(limparManifesto(ruim)).toBeNull();
    }
  });
});

describe('gravarManifesto / lerManifesto', () => {
  let db: DB;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('sem nada publicado: null; publicar de novo substitui', async () => {
    expect(await lerManifesto(db)).toBeNull();
    await gravarManifesto(db, { robo: item }, new Date());
    await gravarManifesto(db, { robo: { ...item, numero: item.numero + 1 } }, new Date());
    expect((await lerManifesto(db))?.robo?.numero).toBe(item.numero + 1);
  });
});
