// Liga o robô como serviço de login do macOS (LaunchAgent `com.pelada.robo`).
//   pnpm robo:instalar                       grava o plist e liga o serviço
//   pnpm robo:desinstalar                    desliga e apaga o plist
//   pnpm robo:instalar --so-gerar=<arquivo>  só escreve o plist nesse arquivo (para conferir)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { lerEstado, nomeDoGrupo, pastaDoRobo } from './estado';

export const ROTULO = 'com.pelada.robo';

// Pastas que o macOS protege (TCC): um serviço do launchd em geral não consegue nem entrar nelas,
// e o erro nem chega ao robo.log (só aparece como saída 78 no `launchctl print`).
const PROTEGIDAS = ['Desktop', 'Documents', 'Downloads', join('Library', 'Mobile Documents')];

/** A pasta protegida que contém o projeto, ou `null` se o projeto está num lugar que o serviço alcança. */
export function pastaProtegida(repo: string, home: string): string | null {
  for (const p of PROTEGIDAS) {
    const base = join(home, p);
    if (repo === base || repo.startsWith(base + sep)) return base;
  }
  return null;
}

export type OpcoesPlist = { repo: string; pnpm: string; node: string; log: string; pastaDoRobo?: string };

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function gerarPlist(o: OpcoesPlist): string {
  const path = [...new Set([dirname(o.pnpm), dirname(o.node), '/usr/bin', '/bin', '/usr/sbin', '/sbin'])].join(':');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${ROTULO}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(o.pnpm)}</string>
    <string>robo</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(o.repo)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xml(path)}</string>${o.pastaDoRobo ? `
    <key>PELADA_ROBO_DIR</key>
    <string>${xml(o.pastaDoRobo)}</string>` : ''}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <!-- Se o robô parar por erro (ex.: sessão do WhatsApp caiu), tenta de novo a cada 5 minutos, não a cada 10 s. -->
  <key>ThrottleInterval</key>
  <integer>300</integer>
  <key>StandardOutPath</key>
  <string>${xml(o.log)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(o.log)}</string>
</dict>
</plist>
`;
}

function opcoesDestaMaquina(): OpcoesPlist {
  // `which` (e não process.execPath) para pegar o atalho estável, que sobrevive a atualizar o node.
  const achar = (cmd: string) => execFileSync('which', [cmd], { encoding: 'utf8' }).trim();
  return {
    repo: realpathSync(process.cwd()),
    pnpm: achar('pnpm'),
    node: achar('node'),
    log: join(homedir(), 'Library', 'Logs', 'PeladaRobo', 'robo.log'),
    pastaDoRobo: process.env.PELADA_ROBO_DIR || undefined,
  };
}

const plistInstalado = () => join(homedir(), 'Library', 'LaunchAgents', `${ROTULO}.plist`);
const dominio = () => `gui/${process.getuid?.() ?? ''}`;

function desligar(): void {
  try {
    execFileSync('launchctl', ['bootout', `${dominio()}/${ROTULO}`], { stdio: 'ignore' });
  } catch {
    // não estava ligado
  }
}

function instalar(): void {
  const pasta = pastaDoRobo(process.env, homedir());
  if (!existsSync(join(pasta, '.env'))) throw new Error(`Falta o arquivo ${join(pasta, '.env')} com a DATABASE_URL (veja docs/operacao.md).`);
  const estado = lerEstado(join(pasta, 'estado.json'));
  if (!estado.grupoId) throw new Error('Rode `pnpm robo:configurar` antes de instalar.');
  const o = opcoesDestaMaquina();
  const protegida = pastaProtegida(o.repo, homedir());
  if (protegida) {
    throw new Error(
      `O projeto está em ${protegida}, uma pasta que o macOS não deixa o serviço do robô abrir.\n` +
        'Mova (ou clone) o projeto para ~/pelada, rode `pnpm install` lá e `pnpm robo:instalar` de novo.',
    );
  }
  mkdirSync(dirname(o.log), { recursive: true });
  mkdirSync(dirname(plistInstalado()), { recursive: true });
  desligar();
  writeFileSync(plistInstalado(), gerarPlist(o));
  execFileSync('launchctl', ['bootstrap', dominio(), plistInstalado()], { stdio: 'inherit' });
  console.log(`Robô instalado: liga sozinho com o Mac. Log em ${o.log}`);
  console.log(`Vai mandar em: ${nomeDoGrupo(estado)}`);
}

function desinstalar(): void {
  desligar();
  rmSync(plistInstalado(), { force: true });
  console.log('Robô desligado e removido do início do Mac.');
}

if (process.argv[1]?.endsWith('instalar.ts')) {
  try {
    const soGerar = process.argv.find((a) => a.startsWith('--so-gerar='))?.slice('--so-gerar='.length);
    if (soGerar) {
      writeFileSync(soGerar, gerarPlist(opcoesDestaMaquina()));
      console.log(`Plist escrito em ${soGerar} (nada foi instalado).`);
    } else if (process.argv.includes('desinstalar')) {
      desinstalar();
    } else {
      instalar();
    }
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
