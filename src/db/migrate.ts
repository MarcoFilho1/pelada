import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema';
import { getDb } from './client';

async function main() {
  const db = getDb();
  const folder = './drizzle';
  if (process.env.DATABASE_URL?.startsWith('pglite:')) {
    await migratePglite(db as PgliteDatabase<typeof schema>, { migrationsFolder: folder });
  } else {
    await migratePg(db as NodePgDatabase<typeof schema>, { migrationsFolder: folder });
  }
  console.log('Migrações aplicadas.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
