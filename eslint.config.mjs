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
    // Gerados: o robô empacotado e o que o app Android compila e leva dentro.
    "dist/**",
    "android/app/build/**",
    "android/app/src/main/assets/**",
    "android/.gradle/**",
    // Ficam no lugar de bibliotecas no pacote do Android: precisam ser CommonJS com require().
    "scripts/android/*.cjs",
  ]),
]);

export default eslintConfig;
