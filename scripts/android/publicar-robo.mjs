// Prepara uma atualização do robô para o app Android: empacota, assina e escreve o manifesto.
//
//   node scripts/android/publicar-robo.mjs chave     cria a chave de assinatura (uma vez) e mostra a pública
//   node scripts/android/publicar-robo.mjs           empacota o robô e gera dist/android/publicar/
//
// Opções:
//   --chave=arquivo.pem      a chave privada (padrão: ~/Library/Application Support/PeladaRobo/android-atualizacao.pem)
//   --arquivo=robo.mjs       assina este arquivo em vez de empacotar (para testes)
//   --versao=..  --numero=.. força a versão e o número (para testes)
//   --app=app.apk --app-versao=0.2.0 --app-numero=2    inclui uma versão nova do próprio app
//   --app-minimo=2           o robô desta versão só entra em apps a partir deste número
//
// O que sai em dist/android/publicar/ (manifesto.json e os arquivos) é para subir, do jeito que
// está, para onde o `atualizacao_url` do pacote aponta. A chave privada nunca sai do computador:
// é ela que impede outra pessoa de mandar código para o robô.
import { execFileSync } from 'node:child_process';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const arg = (nome) => process.argv.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const caminhoDaChave = arg('chave') ?? join(homedir(), 'Library', 'Application Support', 'PeladaRobo', 'android-atualizacao.pem');

const publicaDe = (privada) => createPublicKey(privada).export({ type: 'spki', format: 'der' }).toString('base64');

if (process.argv[2] === 'chave') {
  if (existsSync(caminhoDaChave)) {
    console.log(`A chave já existe em ${caminhoDaChave} (não foi trocada).`);
  } else {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    mkdirSync(dirname(caminhoDaChave), { recursive: true, mode: 0o700 });
    writeFileSync(caminhoDaChave, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    chmodSync(caminhoDaChave, 0o600);
    console.log(`Chave criada em ${caminhoDaChave}. Guarde uma cópia: sem ela não dá para publicar atualizações.`);
  }
  console.log(`\nChave pública (vai no pacote, em "atualizacao_chave"):\n${publicaDe(createPrivateKey(readFileSync(caminhoDaChave)))}`);
  process.exit(0);
}

if (!existsSync(caminhoDaChave)) {
  console.error(`Não achei a chave de assinatura em ${caminhoDaChave}.\nCrie uma vez com: node scripts/android/publicar-robo.mjs chave`);
  process.exit(1);
}
const privada = createPrivateKey(readFileSync(caminhoDaChave));

/** O mesmo texto que o app confere (Manifesto.textoAssinado). */
const assinar = (tipo, item) => sign('sha256', Buffer.from(`pelada-android-v1\n${tipo}\n${item.numero}\n${item.versao}\n${item.sha256}\n`), privada).toString('base64');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const saida = 'dist/android/publicar';
rmSync(saida, { recursive: true, force: true });
mkdirSync(saida, { recursive: true });

let arquivo = arg('arquivo');
let versao;
if (!arquivo) {
  execFileSync('node', ['scripts/compilar-robo-android.mjs'], { stdio: 'inherit' });
  arquivo = 'dist/android/robo.mjs';
  versao = JSON.parse(readFileSync('dist/android/versao.json', 'utf8'));
}
const nomeDaVersao = arg('versao') ?? versao?.versao;
const numero = Number(arg('numero') ?? versao?.numero);
if (!nomeDaVersao || !Number.isFinite(numero)) {
  console.error('Com --arquivo, diga também --versao= e --numero=.');
  process.exit(1);
}

const bytes = readFileSync(arquivo);
const robo = { versao: nomeDaVersao, numero, url: `robo-${nomeDaVersao}.mjs`, sha256: sha256(bytes) };
robo.assinatura = assinar('robo', robo);
copyFileSync(arquivo, join(saida, robo.url));
const manifesto = { robo };

const apk = arg('app');
if (apk) {
  const item = { versao: arg('app-versao'), numero: Number(arg('app-numero')), url: basename(apk), sha256: sha256(readFileSync(apk)) };
  if (!item.versao || !Number.isFinite(item.numero)) {
    console.error('Com --app, diga também --app-versao= e --app-numero= (o versionCode do APK).');
    process.exit(1);
  }
  item.assinatura = assinar('app', item);
  copyFileSync(apk, join(saida, item.url));
  manifesto.app = item;
}
if (arg('app-minimo')) manifesto.app_minimo = Number(arg('app-minimo'));

writeFileSync(join(saida, 'manifesto.json'), JSON.stringify(manifesto, null, 2) + '\n');
console.log(`pronto em ${saida}/: robô ${robo.versao}${manifesto.app ? `, app ${manifesto.app.versao}` : ''}`);
console.log(`chave pública: ${publicaDe(privada)}`);
