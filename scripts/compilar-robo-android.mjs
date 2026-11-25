// Compila o robô para o app Android: um arquivo só, com as dependências dentro (no celular não há
// node_modules). Sai em dist/android/robo.mjs, com um versao.json ao lado.
//
// Ficam de fora: a Baileys (no Android o robô só fala com o WhatsApp pelo ZapGate) e o PGlite
// (banco de ensaio; é carregado de node_modules se o pacote de ensaio trouxer).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const aqui = (arquivo) => fileURLToPath(new URL(`./android/${arquivo}`, import.meta.url));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

await build({
  entryPoints: ['src/robo/principal.ts'],
  outfile: 'dist/android/robo.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  alias: { baileys: aqui('sem-baileys.cjs'), '@electric-sql/pglite': aqui('pglite-opcional.cjs') },
  // Dependências em CommonJS (pg) chamam require(): no formato ESM ele precisa ser criado.
  banner: { js: "import { createRequire as __criarRequire } from 'node:module';\nconst require = __criarRequire(import.meta.url);" },
  logLevel: 'warning',
});

// A versão vem do último commit: o número (data do commit, em segundos) só cresce, e é por ele
// que o app decide se uma atualização é mais nova. Com mudanças não commitadas, vale a hora de agora.
const sujo = git('status', '--porcelain', '--', 'src', 'scripts/android', 'scripts/compilar-robo-android.mjs') !== '';
const commit = git('rev-parse', '--short', 'HEAD');
const numero = sujo ? Math.floor(Date.now() / 1000) : Number(git('log', '-1', '--format=%ct'));
const dia = new Date(numero * 1000).toISOString().slice(0, 10).replaceAll('-', '.');
const versao = { versao: `${dia}-${commit}${sujo ? '+local' : ''}`, numero, commit };
writeFileSync('dist/android/versao.json', JSON.stringify(versao, null, 2) + '\n');
console.log(`robô para Android: dist/android/robo.mjs, versão ${versao.versao}`);
