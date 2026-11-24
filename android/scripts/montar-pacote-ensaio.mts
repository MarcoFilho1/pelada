// Monta o pacote de ENSAIO do app Android: um .zip com tudo para o robô rodar no aparelho sem
// tocar no WhatsApp (motor simulado do ZapGate) nem no banco de verdade (banco de mentira, com
// jogadores de nomes inventados).
//
//   pnpm tsx android/scripts/montar-pacote-ensaio.mts [--saida=caminho.zip] [--com-ia]
//
// --com-ia: põe no pacote a ANTHROPIC_API_KEY que estiver no ambiente, para ensaiar as respostas
//           da IA (gasta crédito de verdade). Sem ela, o ensaio é só com os comandos.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const arg = (nome: string) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const saida = resolve(arg('saida') ?? 'dist/android/pacote-ensaio.zip');
const comIa = process.argv.includes('--com-ia');
if (comIa && !process.env.ANTHROPIC_API_KEY) {
  console.error('--com-ia precisa da ANTHROPIC_API_KEY no ambiente.');
  process.exit(1);
}

const GRUPO = '120363000000000001@g.us';
const NOME_DO_GRUPO = 'Pelada de ensaio';
const ORGANIZADOR = '5581987650001'; // número inventado
const NUMERO_DO_ROBO = '5581900000000'; // número inventado
const segredo = () => randomBytes(24).toString('hex');
const chaveAdmin = segredo();
const chaveRobo = segredo();
const segredoWebhook = segredo();

const pasta = mkdtempSync(join(tmpdir(), 'pacote-ensaio-'));
const escrever = (caminho: string, texto: string) => {
  mkdirSync(join(pasta, caminho, '..'), { recursive: true });
  writeFileSync(join(pasta, caminho), texto);
};

escrever(
  'app.json',
  JSON.stringify({ sessao: 'pelada', chave_admin_env: 'ZAPGATE_ADMIN_KEY', simulado: true, grupo_simulado: GRUPO, grupo_simulado_nome: NOME_DO_GRUPO, organizador_simulado: ORGANIZADOR }, null, 2) + '\n',
);

escrever(
  'zapgate/zapgate.toml',
  `# Ensaio: motor simulado. Nada chega ao WhatsApp.
data_dir = "dados"
env_file = ".env"

[[sessions]]
id = "pelada"
expected_number = "${NUMERO_DO_ROBO}"
engine = "fake"

[sessions.gate]
allow_initiate = ["${GRUPO}", "${ORGANIZADOR}"]
quiet_hours = "off"
warmup = false
pacing_seconds = [0, 1]

[sessions.human]
enabled = false

[sessions.webhook]
url = "http://127.0.0.1:8788/"
secret_env = "PELADA_WEBHOOK_SECRET"

[api]
listen = "127.0.0.1:8787"

[[api.keys]]
name = "admin"
key_env = "ZAPGATE_ADMIN_KEY"
scopes = ["read", "admin"]

[[api.keys]]
name = "robo-pelada"
key_env = "PELADA_ROBO_KEY"
scopes = ["read", "send"]
sessions = ["pelada"]
`,
);
escrever('zapgate/.env', `ZAPGATE_ADMIN_KEY=${chaveAdmin}\nPELADA_ROBO_KEY=${chaveRobo}\nPELADA_WEBHOOK_SECRET=${segredoWebhook}\n`);

escrever(
  'robo/.env',
  [
    // \${APP} é trocado pelo app pela pasta dele no aparelho.
    'DATABASE_URL=pglite:${APP}/ensaio/banco',
    'ROBO_MOTOR=zapgate',
    'ZAPGATE_URL=http://127.0.0.1:8787',
    `ZAPGATE_KEY=${chaveRobo}`,
    `ZAPGATE_WEBHOOK_SECRET=${segredoWebhook}`,
    'ZAPGATE_SESSAO=pelada',
    `ROBO_ADMINS=${ORGANIZADOR}`,
    `ROBO_APELIDOS=${ORGANIZADOR}=Aldo`,
    ...(comIa ? [`ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`] : []),
    '',
  ].join('\n'),
);
escrever('robo/estado.json', JSON.stringify({ ultimo: null, aberturaEnviada: null, grupoId: GRUPO, grupoNome: NOME_DO_GRUPO }, null, 2) + '\n');

// Banco de mentira: as mesmas tabelas do site, com jogadores de nomes inventados.
const banco = join(pasta, 'ensaio', 'banco');
mkdirSync(join(pasta, 'ensaio'), { recursive: true });
process.env.DATABASE_URL = `pglite:${banco}`;
const { getDb } = await import('../../src/db/client');
const { migrate } = await import('drizzle-orm/pglite/migrator');
const { cadastrarJogadores } = await import('../../src/server/jogadores');
const db = getDb();
await migrate(db as never, { migrationsFolder: './drizzle' });
const nomes = ['Aldo', 'Bento', 'Caetano', 'Dario', 'Elias', 'Fausto', 'Gil', 'Heitor', 'Ivo', 'Josué', 'Kauê', 'Lauro', 'Márcio', 'Nuno', 'Otávio', 'Paulo'];
const criados = await cadastrarJogadores(db, nomes.map((nome, i) => ({ nome, nota: 2 + (i % 5) * 0.5 })));
await (db as unknown as { $client: { close(): Promise<void> } }).$client.close();

// O PGlite em si (o robô o carrega de codigo/node_modules quando o banco é "pglite:").
const pglite = realpathSync('node_modules/@electric-sql/pglite');
const destino = join(pasta, 'codigo', 'node_modules', '@electric-sql', 'pglite');
mkdirSync(destino, { recursive: true });
cpSync(join(pglite, 'package.json'), join(destino, 'package.json'));
cpSync(join(pglite, 'dist'), join(destino, 'dist'), { recursive: true, filter: (f) => !f.endsWith('.map') && !f.endsWith('.d.ts') && !f.endsWith('.d.cts') });

mkdirSync(join(saida, '..'), { recursive: true });
rmSync(saida, { force: true });
// `zip -r` guarda também as pastas vazias, de que o banco precisa.
execFileSync('zip', ['-r', '-q', '-X', saida, '.'], { cwd: pasta });
rmSync(pasta, { recursive: true, force: true });
console.log(`pacote de ensaio: ${saida} (${criados.criados.length} jogadores inventados${comIa ? ', com IA' : ', sem IA'})`);
process.exit(0);
