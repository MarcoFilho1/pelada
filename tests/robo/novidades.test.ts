import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { novidadesDoTopo } from '../../scripts/android/novidades.mjs';

describe('as novidades que vão no manifesto', () => {
  it('pega só a seção mais nova, sem a crase dos comandos', () => {
    const texto = ['# Novidades', '', 'Como escrever: uma linha com `- `.', '', '## 2026-11-25', '', '- Mande `caderno` no privado.', '- Outra novidade.', '', '## 2026-11-20', '', '- Coisa antiga.'].join('\n');
    expect(novidadesDoTopo(texto)).toEqual({ dia: '2026-11-25', linhas: ['Mande caderno no privado.', 'Outra novidade.'] });
  });

  it('sem seção ou sem linha, não há novidade', () => {
    expect(novidadesDoTopo('# Novidades\n\n- solta, antes de qualquer seção')).toBeNull();
    expect(novidadesDoTopo('## 2026-11-25\n\nsó texto')).toBeNull();
  });

  it('no máximo 8 linhas de 200 letras', () => {
    const r = novidadesDoTopo(`## 2026-11-25\n${Array.from({ length: 12 }, () => `- ${'a'.repeat(300)}`).join('\n')}`);
    expect(r?.linhas).toHaveLength(8);
    expect(r?.linhas[0]).toHaveLength(200);
  });

  it('o NOVIDADES.md do repositório tem uma seção válida no topo', () => {
    const r = novidadesDoTopo(readFileSync('NOVIDADES.md', 'utf8'));
    expect(r?.dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r?.linhas.length).toBeGreaterThan(0);
  });
});
