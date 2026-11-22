import { defineConfig } from '@playwright/test';
import { E2E } from './tests/e2e/ambiente';

// Teste de ponta a ponta no tamanho de um celular (390×844), contra o `pnpm dev` com um banco
// PGlite só do e2e. O banco é apagado e semeado no comando do servidor, antes do Next subir: o
// Playwright sobe o webServer antes do globalSetup, e duas cópias do PGlite no mesmo diretório
// não podem abrir juntas.
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  globalTeardown: './tests/e2e/limpar.ts',
  use: {
    baseURL: E2E.url,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec tsx tests/e2e/semear.ts && pnpm dev --port ${E2E.porta}`,
    url: `${E2E.url}/admin/entrar`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      DATABASE_URL: `pglite:${E2E.banco}`,
      SESSION_SECRET: 'segredo-so-do-e2e-com-mais-de-32-caracteres',
      ADMIN_USUARIO: E2E.usuario,
      ADMIN_SENHA: E2E.senha,
    },
  },
});
