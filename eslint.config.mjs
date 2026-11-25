import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Gerado: o robô empacotado para o app Android.
    "dist/**",
    // Ficam no lugar de bibliotecas no pacote do Android: precisam ser CommonJS com require().
    "scripts/android/*.cjs",
  ]),
]);

export default eslintConfig;
