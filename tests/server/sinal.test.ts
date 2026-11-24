import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { chaveDoSinalConfere, lerSinal, limparSinal, problemaDoSinal, registrarSinal, type Sinal } from '@/server/sinal';
import { createTestDb } from '../helpers/db';

const CHAVE = 'uma-chave-de-teste-com-24-ou-mais';
const AGORA = new Date('2026-11-25T12:00:00-03:00');
const bom: Sinal = {
  aparelho: 'celular-do-organizador',
  conta: 'connected',
  envio: 'enabled',
  roboRodando: true,
  quedasDoRobo: 0,
  quedasDaConexao: 0,
  versaoDoRobo: '2026.11.24-abc',
  versaoDoApp: '0.1.0',
  simulado: false,
  bateria: 80,
  carregando: true,
  notas: [],
};

describe('chaveDoSinalConfere', () => {
  it('aceita só a chave certa no formato Bearer', () => {
    expect(chaveDoSinalConfere(`Bearer ${CHAVE}`, CHAVE)).toBe(true);
    expect(chaveDoSinalConfere(`Bearer ${CHAVE}x`, CHAVE)).toBe(false);
    expect(chaveDoSinalConfere(CHAVE, CHAVE)).toBe(false);
    expect(chaveDoSinalConfere(null, CHAVE)).toBe(false);
  });

  it('sem chave configurada, ou com chave curta, ninguém passa', () => {
    expect(chaveDoSinalConfere('Bearer ', undefined)).toBe(false);
    expect(chaveDoSinalConfere('Bearer ', '')).toBe(false);
    expect(chaveDoSinalConfere('Bearer curta', 'curta')).toBe(false);
  });
});

describe('limparSinal', () => {
  it('fica só com os campos conhecidos e limita os tamanhos', () => {
    const s = limparSinal({ ...bom, intruso: 'x', aparelho: ` ${'a'.repeat(100)}`, bateria: 150, quedasDoRobo: -3, notas: [...Array(30).fill('n'), 7, 'z'.repeat(999)] });
    expect(s).not.toBeNull();
    expect(s!.aparelho).toHaveLength(63);
    expect(s!.bateria).toBeNull();
    expect(s!.quedasDoRobo).toBe(0);
    expect(s!.notas).toHaveLength(20);
    expect(s!.notas.at(-1)).toHaveLength(300);
    expect('intruso' in s!).toBe(false);
  });

  it('recusa o que não é um objeto com o nome do aparelho', () => {
    for (const ruim of [null, 'texto', 3, [], {}, { aparelho: '  ' }, { aparelho: 5 }]) expect(limparSinal(ruim)).toBeNull();
  });
});

describe('registrarSinal / lerSinal / problemaDoSinal', () => {
  let db: DB;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it('sem nenhum sinal: avisa que nunca chegou', async () => {
    expect(await lerSinal(db, AGORA)).toBeNull();
    expect(problemaDoSinal(null)).toBe('O robô do celular nunca mandou sinal.');
  });

  it('sinal recente e saudável: sem problema; o seguinte substitui o anterior', async () => {
    await registrarSinal(db, bom, new Date(AGORA.getTime() - 120_000));
    await registrarSinal(db, { ...bom, bateria: 79 }, new Date(AGORA.getTime() - 30_000));
    const e = await lerSinal(db, AGORA);
    expect(e?.haSegundos).toBe(30);
    expect(e?.sumido).toBe(false);
    expect(e?.sinal.bateria).toBe(79);
    expect(problemaDoSinal(e)).toBeNull();
  });

  it('sem sinal há mais de 5 minutos: sumiu', async () => {
    await registrarSinal(db, bom, new Date(AGORA.getTime() - 11 * 60_000));
    const e = await lerSinal(db, AGORA);
    expect(e?.sumido).toBe(true);
    expect(problemaDoSinal(e)).toBe('O robô do celular sumiu: o último sinal foi há 11 min.');
  });

  it('no ar, mas com o WhatsApp desconectado ou o robô parado', async () => {
    await registrarSinal(db, { ...bom, conta: 'logged_out' }, AGORA);
    expect(problemaDoSinal(await lerSinal(db, AGORA))).toContain('WhatsApp não está conectado (logged_out)');
    await registrarSinal(db, { ...bom, roboRodando: false }, AGORA);
    expect(problemaDoSinal(await lerSinal(db, AGORA))).toContain('o robô não está rodando');
  });
});
