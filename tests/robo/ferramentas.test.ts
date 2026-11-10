import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DB } from '@/db/client';
import { jogadores, mensalistasMes, peladas } from '@/db/schema';
import { ferramentasDeLeitura } from '@/robo/ferramentas';
import { createTestDb } from '../helpers/db';

let db: DB;
// terça 10/11/2026 12:00 em Recife; próxima quarta = 2026-11-11
const AGORA = new Date('2026-11-10T15:00:00Z');
const ferramentas = () => ferramentasDeLeitura(db, () => AGORA);
const achar = (nome: string) => ferramentas().find((f) => f.nome === nome)!;

async function contagens() {
  const r = await db.execute(sql`
    select (select count(*) from peladas) p, (select count(*) from presencas) pr,
           (select count(*) from mensalistas_mes) m, (select count(*) from jogadores) j,
           (select count(*) from partidas) pa, (select count(*) from times) t`);
  return JSON.stringify((r as unknown as { rows: unknown[] }).rows);
}

beforeEach(async () => {
  db = await createTestDb();
  const js = await db.insert(jogadores).values([{ nome: 'Ana' }, { nome: 'Beto' }]).returning();
  await db.insert(mensalistasMes).values(js.map((j) => ({ mes: '2026-11', jogadorId: j.id })));
});

describe('ferramentasDeLeitura', () => {
  it('expõe as seis ferramentas com schema', () => {
    const fs = ferramentas();
    expect(fs.map((f) => f.nome)).toEqual(['lista_da_semana', 'mensalistas_do_mes', 'ranking', 'artilharia', 'partidas_da_noite', 'times_da_noite']);
    for (const f of fs) expect(f.parametros).toMatchObject({ type: 'object' });
  });

  it('só lêem: nenhuma tabela muda, nem a pelada da semana é criada', async () => {
    const antes = await contagens();
    for (const f of ferramentas()) await f.executar({});
    await achar('ranking').executar({ periodo: 'geral' });
    expect(await contagens()).toBe(antes);
  });

  it('lista da semana mostra a prévia dos mensalistas', async () => {
    const r = (await achar('lista_da_semana').executar({})) as { data: string; lista: { nome: string }[] };
    expect(r.data).toBe('2026-11-11');
    expect(r.lista.map((i) => i.nome)).toEqual(['Ana', 'Beto']);
  });

  it('mensalistas do mês', async () => {
    expect(await achar('mensalistas_do_mes').executar({})).toMatchObject({ mes: '2026-11', mensalistas: ['Ana', 'Beto'] });
  });

  it('ranking e artilharia sem partidas ficam vazios; período inválido não quebra', async () => {
    expect(await achar('ranking').executar({ periodo: 'lixo' })).toMatchObject({ total: 0, jogadores: [] });
    expect(await achar('artilharia').executar({})).toMatchObject({ artilheiros: [] });
  });

  it('argumentos inválidos lançam erro', async () => {
    await expect(achar('ranking').executar({ periodo: 5 })).rejects.toThrow();
    await expect(achar('ranking').executar('x')).rejects.toThrow();
  });

  it('partidas e times da noite usam a última pelada sem criar nada', async () => {
    expect(await achar('partidas_da_noite').executar({})).toEqual({ data: null, partidas: [] });
    await db.insert(peladas).values({ data: '2026-11-04' });
    expect(await achar('times_da_noite').executar({})).toEqual({ data: '2026-11-04', times: [] });
    expect(await achar('partidas_da_noite').executar({})).toEqual({ data: '2026-11-04', partidas: [] });
  });
});
