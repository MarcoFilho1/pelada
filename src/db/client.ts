import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import * as schema from './schema';

/** Instância Drizzle comum aos dois drivers (pg em produção, PGlite em dev/testes). */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const PGLITE_PREFIX = 'pglite:';

let instance: DB | undefined;

export function getDb(): DB {
  if (instance) return instance;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida');
  instance = url.startsWith(PGLITE_PREFIX)
    ? drizzlePglite({ client: new PGlite(url.slice(PGLITE_PREFIX.length)), schema })
    : drizzlePg({ client: new Pool({ connectionString: url }), schema });
  return instance;
}
