// Monta o pacote DE VERDADE do app Android, a partir do que o robô usa hoje no Mac:
// as regras do ZapGate, a configuração do robô e, se pedido, a sessão do WhatsApp.
//
//   node scripts/android/montar-pacote.mjs [opções]
//
//   --zapgate=arquivo.toml   as regras de hoje          (padrão: ~/zapgate-teste/zapgate.toml)
//   --robo=pasta             a pasta do robô            (padrão: ~/Library/Application Support/PeladaRobo)
//   --com-sessao             leva junto a sessão do WhatsApp: o celular entra no lugar do Mac sem
//                            parear de novo. Exige o ZapGate do Mac DESLIGADO (nunca dois ligados
//                            na mesma conta), e ele não pode voltar a ser ligado depois.
//   --atualizacao-url= --atualizacao-chave= [--atualizacao-token=]   onde o app procura versão nova
//   --sinal-url= --sinal-chave= [--aparelho="celular do Fulano"]     para onde vai o sinal de vida
//   --saida=arquivo.zip      (padrão: dist/android/pacote.zip)
//
// As chaves entre o robô e o ZapGate são criadas novas para o celular (as do Mac não vão).
// O pacote leva segredos (banco, IA): mande direto para o aparelho e apague depois de importar.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { adaptarEnvDoRobo, adaptarToml } from './pacote.mjs';

const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const parar = (msg) => {
  console.error(msg);
  process.exit(1);
};

const arquivoToml = resolve(arg('zapgate') ?? join(homedir(), 'zapgate-teste', 'zapgate.toml'));
const pastaDoRobo = resolve(arg('robo') ?? join(homedir(), 'Library', 'Application Support', 'PeladaRobo'));
const saida = resolve(arg('saida') ?? 'dist/android/pacote.zip');
const comSessao = process.argv.includes('--com-sessao');

if (!existsSync(arquivoToml)) parar(`Não achei as regras do ZapGate em ${arquivoToml} (use --zapgate=).`);
if (!existsSync(join(pastaDoRobo, '.env'))) parar(`Não achei a configuração do robô em ${join(pastaDoRobo, '.env')} (use --robo=).`);

const original = readFileSync(arquivoToml, 'utf8');
const { toml, sessao } = adaptarToml(original);
const segredo = () => randomBytes(24).toString('hex');
const chaveAdmin = segredo();
const chaveDoRobo = segredo();
const segredoDoWebhook = segredo();

const pasta = mkdtempSync(join(tmpdir(), 'pacote-'));
try {
  const escrever = (caminho, texto) => {
    mkdirSync(dirname(join(pasta, caminho)), { recursive: true });
    writeFileSync(join(pasta, caminho), texto, { mode: 0o600 });
  };
  escrever('zapgate/zapgate.toml', toml);
  escrever('zapgate/.env', `ZAPGATE_ADMIN_KEY=${chaveAdmin}\nPELADA_ROBO_KEY=${chaveDoRobo}\nPELADA_WEBHOOK_SECRET=${segredoDoWebhook}\n`);
  escrever('robo/.env', adaptarEnvDoRobo(readFileSync(join(pastaDoRobo, '.env'), 'utf8'), { chaveDoRobo, segredoDoWebhook, sessao }));
  if (existsSync(join(pastaDoRobo, 'estado.json'))) escrever('robo/estado.json', readFileSync(join(pastaDoRobo, 'estado.json'), 'utf8'));

  const app = { sessao, chave_admin_env: 'ZAPGATE_ADMIN_KEY', simulado: /^\s*engine\s*=\s*"fake"/m.test(original) };
  for (const [opcao, campo] of [['atualizacao-url', 'atualizacao_url'], ['atualizacao-chave', 'atualizacao_chave'], ['atualizacao-token', 'atualizacao_token'], ['sinal-url', 'sinal_url'], ['sinal-chave', 'sinal_chave'], ['aparelho', 'aparelho']]) {
    if (arg(opcao)) app[campo] = arg(opcao);
  }
  escrever('app.json', JSON.stringify(app, null, 2) + '\n');

  if (comSessao) {
    // Copiar a sessão com o ZapGate rodando levaria um banco pela metade, e ligar os dois depois
    // derrubaria a conta: por isso só com ele parado.
    let rodando = '';
    try {
      rodando = execFileSync('pgrep', ['-x', 'zapgate'], { encoding: 'utf8' }).trim();
    } catch {
      rodando = '';
    }
    if (rodando) parar('O ZapGate do Mac está ligado. Desligue antes (e o robô também): com --com-sessao o celular entra no lugar do Mac, e os dois nunca podem ficar ligados na mesma conta.');
    const dados = original.match(/^\s*data_dir\s*=\s*"([^"]+)"/m)?.[1];
    const origem = dados ? resolve(dirname(arquivoToml), dados.replace(/^~/, homedir())) : null;
    if (!origem || !existsSync(join(origem, 'sessions', sessao))) parar(`Não achei a sessão "${sessao}" em ${origem ?? '(data_dir não declarado)'}.`);
    cpSync(origem, join(pasta, 'zapgate', 'dados'), { recursive: true });
  }

  mkdirSync(dirname(saida), { recursive: true });
  rmSync(saida, { force: true });
  execFileSync('zip', ['-r', '-q', '-X', saida, '.'], { cwd: pasta });
  chmodSync(saida, 0o600);
} finally {
  rmSync(pasta, { recursive: true, force: true });
}

console.log(`pacote: ${saida}`);
console.log(`conta "${sessao}"${comSessao ? ', com a sessão do WhatsApp (não ligue mais o ZapGate do Mac nessa conta)' : ', sem sessão (o celular vai parear pelo código)'}.`);
console.log('Ele leva segredos (banco, IA): mande direto para o aparelho e apague depois de importar.');
