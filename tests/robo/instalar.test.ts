import { describe, expect, it } from 'vitest';
import { gerarPlist, pastaProtegida, ROTULO } from '@/robo/instalar';

describe('plist do LaunchAgent', () => {
  const plist = gerarPlist({
    repo: '/Users/u/Desktop/pelada & cia',
    pnpm: '/opt/homebrew/bin/pnpm',
    node: '/Users/u/.nvm/versions/node/v22/bin/node',
    log: '/Users/u/Library/Logs/PeladaRobo/robo.log',
  });

  it('roda `pnpm robo` na pasta do projeto, liga com o Mac e se mantém vivo', () => {
    expect(ROTULO).toBe('com.pelada.robo');
    expect(plist).toContain('<string>com.pelada.robo</string>');
    expect(plist).toMatch(/<key>ProgramArguments<\/key>\s*<array>\s*<string>\/opt\/homebrew\/bin\/pnpm<\/string>\s*<string>robo<\/string>/);
    expect(plist).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
    expect(plist).toMatch(/<key>KeepAlive<\/key>\s*<true\/>/);
    expect(plist).toContain('<string>/Users/u/Library/Logs/PeladaRobo/robo.log</string>');
  });

  it('PATH com as pastas do pnpm e do node (e o caffeinate em /usr/bin); escapa XML', () => {
    expect(plist).toContain('<string>/opt/homebrew/bin:/Users/u/.nvm/versions/node/v22/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>');
    expect(plist).toContain('<string>/Users/u/Desktop/pelada &amp; cia</string>');
    expect(plist).not.toContain('PELADA_ROBO_DIR');
  });

  it('pasta do robô personalizada vai junto para o serviço', () => {
    const outro = gerarPlist({ repo: '/r', pnpm: '/b/pnpm', node: '/b/node', log: '/l', pastaDoRobo: '/Users/u/RoboTeste' });
    expect(outro).toMatch(/<key>PELADA_ROBO_DIR<\/key>\s*<string>\/Users\/u\/RoboTeste<\/string>/);
  });
});

describe('pasta do projeto que o launchd não alcança', () => {
  const home = '/Users/u';
  it('recusa Mesa, Documentos, Downloads e iCloud', () => {
    expect(pastaProtegida('/Users/u/Desktop/things/pelada', home)).toBe('/Users/u/Desktop');
    expect(pastaProtegida('/Users/u/Documents/pelada', home)).toBe('/Users/u/Documents');
    expect(pastaProtegida('/Users/u/Downloads/pelada', home)).toBe('/Users/u/Downloads');
    expect(pastaProtegida('/Users/u/Library/Mobile Documents/com~apple~CloudDocs/pelada', home)).toBe('/Users/u/Library/Mobile Documents');
  });
  it('aceita ~/pelada e nomes parecidos que não são as pastas protegidas', () => {
    expect(pastaProtegida('/Users/u/pelada', home)).toBeNull();
    expect(pastaProtegida('/Users/u/Desktops/pelada', home)).toBeNull();
    expect(pastaProtegida('/Users/u/code/Desktop/pelada', home)).toBeNull();
  });
});
