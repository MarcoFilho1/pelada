import { describe, expect, it } from 'vitest';
import { gerarPlist, ROTULO } from '@/robo/instalar';

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
  });
});
