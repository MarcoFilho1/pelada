# Pelada

Gerenciador da pelada de quarta (20:30–22:30): lista de presença com mensalistas e fila de diaristas, sorteio de times equilibrado por nota, anotação das partidas ao vivo e ranking.

Site mobile first, acessado pelo navegador, sem instalar aplicativo. Interface em português, fuso de Recife.

- Guia de quem administra: [docs/operacao.md](docs/operacao.md)
- Sistema visual e tom: [DESIGN.md](DESIGN.md) e [PRODUCT.md](PRODUCT.md)
- Regras de produto: [docs/superpowers/specs/2026-11-04-pelada-design.md](docs/superpowers/specs/2026-11-04-pelada-design.md)

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Drizzle ORM. Banco: Postgres (Neon em produção, pool `pg`) ou PGlite em arquivo para desenvolvimento e testes. Testes: Vitest e Playwright. Gerenciador de pacotes: pnpm.

## Desenvolvimento local

Não precisa de Docker nem de Postgres: o `DATABASE_URL` com prefixo `pglite:` usa um banco em arquivo.

```bash
pnpm install
export DATABASE_URL=pglite:./.pglite-dev
export SESSION_SECRET=um-segredo-local-com-mais-de-32-caracteres
export ADMIN_USUARIO=admin ADMIN_SENHA=uma-senha-de-10-ou-mais
pnpm db:migrate   # cria as tabelas
pnpm db:seed      # cria o primeiro admin (não faz nada se já existe um)
pnpm dev          # http://localhost:3000
```

Jogadores entram em `/entrar` (PIN inicial 1234, troca obrigatória); o admin entra em `/admin/entrar`. Para apagar o banco local, remova a pasta `.pglite-dev`.

## Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Em produção, a URL do Neon com pool (host terminado em `-pooler`). Em desenvolvimento, `pglite:./.pglite-dev`. |
| `SESSION_SECRET` | Assina os cookies de sessão. Mínimo de 32 caracteres. |
| `ADMIN_USUARIO`, `ADMIN_SENHA` | Primeiro admin, criado por `pnpm db:seed` se ainda não existir nenhum. Senha com pelo menos 10 caracteres. |

Veja `.env.example`.

## Testes

```bash
pnpm lint && pnpm typecheck
pnpm test        # Vitest, contra PGlite em memória
pnpm test:e2e    # Playwright, navegador headless, celular 390×844
```

O e2e sobe o `pnpm dev` na porta 3217 com um banco PGlite só dele (`.pglite-e2e`), semeado por `tests/e2e/semear.ts` e apagado no fim. Na primeira vez, instale o navegador: `pnpm exec playwright install chromium`.

## Produção

Planejado: Vercel + Neon (ver [docs/operacao.md](docs/operacao.md)). Quando for ao ar, rode `pnpm db:migrate` e `pnpm db:seed` com as variáveis de produção.
