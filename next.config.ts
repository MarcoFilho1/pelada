import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite acha o próprio .wasm por caminho relativo ao módulo; empacotado, ele se perde.
  serverExternalPackages: ['@electric-sql/pglite'],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
