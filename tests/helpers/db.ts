import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { DB } from '@/db/client';
import * as schema from '@/db/schema';

/** Banco novo em memória (PGlite) com as migrações de ./drizzle aplicadas. */
export async function createTestDb(): Promise<DB> {
  const db = drizzle({ client: new PGlite(), schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  return db;
}
