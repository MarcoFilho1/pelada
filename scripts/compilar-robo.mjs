// Compila o robô (TypeScript) num arquivo só de JavaScript, em dist/robo/principal.mjs, para rodar
// direto no Node: sem pnpm e tsx no meio (≈45 MB em vez de ≈110 MB). As dependências continuam em
// node_modules (não entram no arquivo). Rode de novo sempre que o código do robô mudar; o
// `scripts/robo-reiniciar.sh` faz as duas coisas juntas.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/robo/principal.ts'],
  outfile: 'dist/robo/principal.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'external',
  sourcemap: true,
  logLevel: 'warning',
});
console.log('robô compilado em dist/robo/principal.mjs');
