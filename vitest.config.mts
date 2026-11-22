import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    // PGlite + migrations por teste podem ser lentos em máquina carregada ou CI.
    hookTimeout: 30_000,
    testTimeout: 20_000,
    include: ['tests/**/*.test.ts'],
    coverage: { provider: 'v8' },
  },
});
