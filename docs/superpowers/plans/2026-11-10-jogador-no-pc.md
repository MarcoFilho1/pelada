# Telas do jogador no PC — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** as telas do jogador (lista, ranking, perfil) usam o PC a partir de 1024px, com o menu no topo, sem mudar nada abaixo de 1024px.

**Architecture:** variantes `lg:` sobre os componentes existentes (mesmo DOM sempre que possível), como no admin (`docs/superpowers/plans/2026-11-06-admin-no-pc.md`, padrões: `contents` / `hidden lg:*` + `lg:hidden` com o mesmo estado, "Toque"→"Clique" em `lg`). A navegação do topo reaproveita os itens de `src/components/nav-jogador.tsx`.

**Tech Stack:** Next.js 16 (ler `node_modules/next/dist/docs/` antes de mexer em layout), Tailwind v4, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-jogador-no-pc-design.md`

## Global Constraints

- Corte único `lg` (1024px). **Abaixo de 1024px idêntico** ao de hoje: provar com capturas 390×844 antes/depois (diferença de pixels, como no admin).
- DESIGN.md manda: sem cor/fonte/raio novos, sem borda/sombra em repouso, lima só para estado, pílula branca = única ação primária do bloco, Barlow só em títulos/marca/números, nada abaixo de 14px, alvos ≥48px.
- Nenhuma regra de negócio muda. Telas de uma tarefa (entrar, trocar PIN) continuam uma coluna centrada.
- UI: carregar as skills **impeccable** (ler `reference/craft-floor.md`) e **taste-skill:design-taste-frontend** (app screens) antes de editar; rodar `impeccable detect --json` nos arquivos mudados; relatar o que apontaram. Atualizar o DESIGN.md (seção "No PC") com o jogador.
- Git: commits em pt-BR sem atribuição a IA. Nunca `pkill` amplo (porta 3000 é de outro app).
- Verificação: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` limpos; capturas 1440×900, 1024×768 e 390×844 olhadas.

## Review Focus

1. Ranking a 1024px com 20+ jogadores e nomes longos: todas as colunas cabem sem rolagem lateral da página nem da tabela, nome truncado e não cortando números.
2. Lista no PC com fila longa (6+): o bloco "sua vaga" fica visível enquanto a lista rola; nada sobrepõe.
3. Redimensionar atravessando 1024px com a confirmação de "Não vou" aberta: o estado não se perde nem duplica.
4. Teclado: Tab segue a ordem visual (topo → bloco → lista); foco visível; nomes acessíveis únicos.
5. As e2e de celular existentes (lista, ranking, perfil) passam sem mudar asserções.

---

### Task 1: Menu no topo e Lista em duas colunas

**Files:** `src/app/(jogador)/layout.tsx`, `src/components/nav-jogador.tsx`, `src/components/topo.tsx` (se a barra do topo precisar dos links), `src/app/(jogador)/lista/lista-jogador.tsx`, `src/app/(jogador)/lista/page.tsx`, `tests/e2e/jogador-pc.spec.ts` (novo), `DESIGN.md`.

- [ ] Menu do jogador no topo em `lg` (links Lista · Ranking · Perfil à direita da marca, `aria-current="page"` no atual, mesmo visual do item atual do admin); a barra de baixo e seu espaço reservado ficam `lg:hidden`. Telas sem barra (`/perfil/pin`) continuam sem menu.
- [ ] Lista em `lg`: coluna da esquerda com o bloco "sua vaga" e "Copiar lista" (presos no alto ao rolar); coluna da direita com Lista e Fila. Abaixo de `lg`, ordem e aparência atuais.
- [ ] e2e `tests/e2e/jogador-pc.spec.ts` a 1440×900 (`isMobile:false`, use um novato próprio do `tests/e2e/ambiente.ts`, nunca um de outro teste): o menu do topo mostra as 3 seções e marca a atual; a barra de baixo não aparece; na Lista o bloco "sua vaga" fica à esquerda da lista (x menor); sem rolagem lateral da página.
- [ ] DESIGN.md "No PC" (jogador: menu, lista); capturas, detector, lint/typecheck/test/e2e. Commits.

### Task 2: Ranking e Perfil

**Files:** `src/app/(jogador)/ranking/page.tsx`, `src/app/(jogador)/ranking/tabela-ranking.tsx`, `src/app/(jogador)/perfil/page.tsx`, `tests/e2e/jogador-pc.spec.ts`, `DESIGN.md`.

- [ ] Ranking em `lg`: a tabela inteira sem rolagem lateral (colunas fixas à esquerda podem deixar de ser presas no PC), destaques ao lado ou acima sem esticar, a dica "Arraste para o lado…" some (`lg:hidden`). Ordenação, `?p=` e a linha da própria pessoa continuam iguais.
- [ ] Perfil em `lg`: números (pontos + grade) numa coluna, "Quartas" na outra; "Trocar PIN" e "Sair deste aparelho" seguem no fim da coluna dos números.
- [ ] e2e a 1440×900: no Ranking, `scrollWidth` do contêiner da tabela ≤ `clientWidth` (sem rolagem lateral) e a dica não aparece; no Perfil, a coluna das Quartas fica à direita dos números.
- [ ] DESIGN.md "No PC" (ranking, perfil); capturas, detector, lint/typecheck/test/e2e. Commits.
