import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import * as schema from './schema';

/** Instância Drizzle comum aos dois drivers (pg em produção, PGlite em dev/testes). */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const PGLITE_PREFIX = 'pglite:';

// Em dev o hot reload reavalia este módulo; guardar no globalThis evita abrir
// um pool (ou um PGlite no mesmo diretório) a cada recarga.
const cache = globalThis as typeof globalThis & { __peladaDb?: DB };

function criarDb(url: string): DB {
  if (url.startsWith(PGLITE_PREFIX)) {
    return drizzlePglite({ client: new PGlite(url.slice(PGLITE_PREFIX.length)), schema });
  }
  const pool = new Pool({ connectionString: url });
  // Sem este listener, um erro numa conexão ociosa derruba o processo.
  pool.on('error', (err) => console.error('Erro no pool do Postgres:', err));
  return drizzlePg({ client: pool, schema });
}

let instance: DB | undefined = cache.__peladaDb;

export function getDb(): DB {
  if (instance) return instance;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  instance = criarDb(url);
  if (process.env.NODE_ENV !== 'production') cache.__peladaDb = instance;
  return instance;
}
