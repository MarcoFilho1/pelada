import { pathToFileURL } from 'node:url';
import type { DB } from './client';
import { admins } from './schema';
import { hashSegredo } from '../server/senha';

type EnvSeed = Record<string, string | undefined>;

/** Cria o primeiro admin a partir do ambiente. Se já existe algum admin, não faz nada. */
export async function semearAdmin(db: DB, env: EnvSeed): Promise<'criado' | 'ja_existe'> {
  const usuario = env.ADMIN_USUARIO?.trim();
  const senha = env.ADMIN_SENHA;
  if (!usuario) throw new Error('Defina ADMIN_USUARIO para criar o primeiro admin');
  if (!senha) throw new Error('Defina ADMIN_SENHA para criar o primeiro admin');

  const [existente] = await db.select({ id: admins.id }).from(admins).limit(1);
  if (existente) return 'ja_existe';

  await db.insert(admins).values({ usuario, senhaHash: await hashSegredo(senha) });
  return 'criado';
}

async function main() {
  const { getDb } = await import('./client');
  const resultado = await semearAdmin(getDb(), process.env);
  console.log(
    resultado === 'criado'
      ? `Admin "${process.env.ADMIN_USUARIO?.trim()}" criado.`
      : 'Já existe admin; nada foi feito.',
  );
  process.exit(0);
}

// Roda só quando executado direto (`pnpm db:seed`), não quando importado nos testes.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
