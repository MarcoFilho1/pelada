// Banco novo do e2e: migrações, o admin, 8 jogadores, a pelada de hoje (Recife) e 2 times definitivos.
import { rmSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../../src/db/schema';
import { semearAdmin } from '../../src/db/seed';
import { dataDe } from '../../src/domain/tempo';
import { salvarTimesDefinitivos } from '../../src/server/times';
import { E2E } from './ambiente';

async function main() {
  rmSync(E2E.banco, { recursive: true, force: true });
  const client = new PGlite(E2E.banco);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  await semearAdmin(db, { ADMIN_USUARIO: E2E.usuario, ADMIN_SENHA: E2E.senha });

  const criados = await db
    .insert(schema.jogadores)
    .values([...E2E.azul, ...E2E.laranja].map((nome) => ({ nome, pinPrecisaTrocar: false })))
    .returning({ id: schema.jogadores.id, nome: schema.jogadores.nome });
  const idDe = (nome: string) => criados.find((j) => j.nome === nome)!.id;
  const [pelada] = await db.insert(schema.peladas).values({ data: dataDe(new Date()) }).returning({ id: schema.peladas.id });
  await salvarTimesDefinitivos(db, pelada.id, [E2E.azul.map(idDe), E2E.laranja.map(idDe)]);

  await client.close();
  console.log('Banco do e2e pronto.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
