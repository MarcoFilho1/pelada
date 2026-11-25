// A ponte do Mac com o robô que roda num celular, pelo banco (docs/android.md).
//
//   node scripts/revisao/ponte.mjs baixar <AAAA-MM-DD> <arquivo das conversas> <arquivo do registro>
//        traz do banco o que o robô viveu naquele dia (de Recife) para os arquivos que a revisão lê
//   node scripts/revisao/ponte.mjs por <nome>      grava o recado <nome> com o JSON da entrada padrão
//   node scripts/revisao/ponte.mjs tirar <nome>    escreve o recado <nome> e o apaga (nada, se não há)
//   node scripts/revisao/ponte.mjs apagar <nome>
//
// O endereço do banco vem de DATABASE_URL ou do .env do robô. Só este script chega ao banco:
// o Claude Code da revisão continua sem acesso a ele.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

const [comando, a, b, c] = process.argv.slice(2);
const parar = (msg) => {
  console.error(msg);
  process.exit(2);
};

let url = process.env.DATABASE_URL;
if (!url) {
  const env = join(homedir(), 'Library', 'Application Support', 'PeladaRobo', '.env');
  if (existsSync(env)) url = readFileSync(env, 'utf8').match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '');
}
if (!url) parar('Não sei onde está o banco: defina DATABASE_URL ou o .env do robô.');

const banco = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
await banco.connect();
try {
  if (comando === 'baixar') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a ?? '') || !b || !c) parar('uso: ponte.mjs baixar <AAAA-MM-DD> <conversas> <registro>');
    // O dia de Recife (sempre UTC-3) vai das 03:00 UTC às 03:00 UTC do dia seguinte.
    const desde = new Date(`${a}T03:00:00Z`);
    const ate = new Date(desde.getTime() + 24 * 60 * 60 * 1000);
    const ler = async (tipo) => (await banco.query('select dados from robo_diario where tipo = $1 and quando >= $2 and quando < $3 order by quando, id', [tipo, desde, ate])).rows.map((r) => r.dados);
    const conversas = await ler('conversa');
    // Junta ao que já estiver no arquivo (conversas de quando o robô rodava no Mac), sem repetir.
    const ja = existsSync(b) ? readFileSync(b, 'utf8').split('\n').filter(Boolean) : [];
    const vistas = new Set(ja);
    const novas = conversas.filter((l) => !vistas.has(l));
    if (ja.length + novas.length > 0) writeFileSync(b, [...ja, ...novas].join('\n') + '\n');
    const registro = await ler('log');
    writeFileSync(c, registro.length ? registro.join('\n') + '\n' : '');
    console.log(`ponte: ${novas.length} conversa(s) nova(s) e ${registro.length} linha(s) de registro do dia ${a}`);
  } else if (comando === 'por') {
    if (!a) parar('uso: ponte.mjs por <nome>');
    const texto = readFileSync(0, 'utf8').trim();
    JSON.parse(texto); // recado que não é JSON não entra
    await banco.query('insert into robo_recados (nome, dados, quando) values ($1, $2, now()) on conflict (nome) do update set dados = excluded.dados, quando = excluded.quando', [a, texto]);
  } else if (comando === 'tirar') {
    if (!a) parar('uso: ponte.mjs tirar <nome>');
    const r = await banco.query('delete from robo_recados where nome = $1 returning dados', [a]);
    if (r.rows[0]) process.stdout.write(r.rows[0].dados + '\n');
  } else if (comando === 'apagar') {
    if (!a) parar('uso: ponte.mjs apagar <nome>');
    await banco.query('delete from robo_recados where nome = $1', [a]);
  } else {
    parar('comandos: baixar, por, tirar, apagar');
  }
} finally {
  await banco.end();
}
