# Admin no PC — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a área admin usa a tela do PC (≥1024px) com menu lateral e telas em colunas, sem mudar nada abaixo de 1024px; o Painel vira um resumo da semana.

**Architecture:** só variantes `lg:` do Tailwind v4 sobre os componentes que já existem (o mesmo DOM serve celular e PC sempre que possível); onde o PC precisa de outra composição (menu lateral, tabela de jogadores, painel lateral do sorteio), um componente irmão que só aparece em `lg` e reaproveita a mesma lógica/estado. O resumo do Painel é uma função de servidor nova que só lê.

**Tech Stack:** Next.js 16 (App Router; ler `node_modules/next/dist/docs/` antes de mexer em layout), React 19, TS strict, Tailwind v4 (tokens em `src/app/globals.css`), Drizzle + PGlite nos testes, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-admin-no-pc-design.md`

## Global Constraints

- Corte único: `lg` (1024px). **Abaixo de 1024px o resultado visual e o comportamento ficam idênticos aos de hoje** — conferir com capturas a 390×844 antes/depois de cada tela tocada.
- DESIGN.md manda: fundo `chao` #000, superfícies `placa`/`placa-alta`, sem borda e sem sombra em repouso (só o que flutua ganha sombra), lima só para estado, vermelho só para erro, pílula branca = única ação primária do bloco, Barlow Condensed só em títulos/marca/números, Inter no resto, nada abaixo de 14px, alvos de 48px no mínimo. Nenhuma cor, fonte ou raio novo.
- Anotador ao vivo (`/admin/partida/[id]`) continua a tela cheia do celular, sem menu lateral, também no PC.
- Nenhuma regra de negócio, ação de servidor ou dado gravado muda (exceto a leitura nova do resumo).
- UI: antes de editar, carregar as skills **impeccable** (ler `reference/craft-floor.md`) e **taste-skill:design-taste-frontend** (run de app screens); ao terminar, rodar `impeccable detect --json` nos arquivos de UI mudados e listar no relatório o que as duas apontaram e o que foi feito. Atualizar o DESIGN.md com uma seção "No PC (≥1024px)" descrevendo o que a tarefa decidiu.
- Copy em pt-BR, tom de conversa entre amigos, sem jargão.
- Git: um commit por passo lógico, mensagens em pt-BR no estilo `feat: …`/`fix: …`, **sem** linhas de atribuição a IA (sem Co-Authored-By, sem "Generated with").
- Verificação de cada tarefa: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` limpos; capturas a 1440×900, 1024×768 e 390×844 de cada tela tocada, olhadas.
- Processos: nunca `pkill` amplo (o PoupAI roda na porta 3000); matar só pela porta que você abriu.

## Review Focus

1. Tela entre 1024 e 1280px (notebook pequeno): colunas não podem espremer nomes nem criar rolagem lateral da página.
2. Mudança de largura com a tela aberta (girar o tablet, redimensionar a janela): estado escolhido (jogador escolhido no sorteio, linha aberta, marcações não salvas) não se perde nem duplica.
3. Lista longa no PC: 22+ jogadores, fila com 6+, 5 times de 5 — nada corta, nada sobrepõe.
4. Teclado no PC: Tab percorre menu e controles na ordem visual; foco visível (anel branco); Enter/Espaço acionam.
5. Celular intacto: as e2e existentes (390×844) passam sem mudar asserções de layout.

---

### Task 1: Moldura lateral, Painel resumo, Mensalistas e Admins (PR 1, branch `feature/admin-pc-base`, base `develop`)

**Files:**
- Modify: `src/app/admin/(area)/layout.tsx`, `src/components/topo.tsx` (variante da `Tela` para a área admin ou wrapper novo), `src/components/nav-admin.tsx` (vertical em `lg`), `src/components/fora-do-anotador.tsx` se preciso
- Create: `src/server/painel.ts`, `tests/server/painel.test.ts`
- Modify: `src/app/admin/(area)/page.tsx` (Painel resumo, todas as larguras)
- Modify: `src/app/admin/(area)/mensalistas/mensalistas-admin.tsx`, `src/app/admin/(area)/admins/forms-admins.tsx`
- Create: `tests/e2e/admin-pc.spec.ts`
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: `estadoDaSemana(db, now)` (`src/server/presencas.ts`), `peladaDoDia(db, now)` (`src/server/pelada.ts`), `timesDaPelada`, `partidasJogadas(db, peladaId) → {jogadas, emAndamento}` (`src/server/times.ts`), `partidaEmAndamento(db, peladaId) → number | null` (`src/server/partidas.ts`), `listarJogadores(db, {incluirInativos:false})` com `pinPadrao`, `previaMensalistasDoMes(db, mes)`, `mesDaQuarta`, `proximaQuarta`, `aberturaLista` (`src/domain/tempo.ts`), `MAX_MENSALISTAS`.
- Produces: `resumoDoPainel(db: DB, now: Date): Promise<ResumoPainel>` em `src/server/painel.ts`, com
  ```ts
  type ResumoPainel = {
    lista: { data: string; abertura: string; estado: 'antes' | 'aberta' | 'fechada' | 'cancelada'; confirmados: number; vagas: number; naFila: number };
    sorteio: { data: string; hoje: boolean; definidos: boolean } | null;   // null = sem pelada do dia
    partidas: { jogadas: number; emAndamentoId: number | null } | null;   // null = sem pelada do dia
    jogadores: { ativos: number; pinPadrao: number };
    mensalistas: { mes: string; marcados: number; vagas: number };
  };
  ```
  Só lê (não pode criar pelada nem copiar mensalistas: usar `peladaDoDia` só quando ele já não cria — ver nota abaixo). Datas em `YYYY-MM-DD`; a página formata com `diaMes`.
- Moldura em `lg`: menu lateral fixo (`aria-label="Admin"`, `aria-current="page"` no atual), "Sair" no pé (mesma `form action={sairDoAdmin}`); as abas e a barra do topo continuam abaixo de `lg`. Tasks 2 e 3 contam com: o conteúdo de cada página admin ocupa a coluna de conteúdo inteira em `lg` e cada página decide as próprias colunas.

Nota de leitura pura: `peladaDoDia` chama `obterPeladaDaSemana` (que cria) quando hoje é quarta e a pelada ainda não existe. No resumo, use uma leitura que não cria: se hoje é a quarta da semana e não há pelada, trate como `estadoDaSemana` já trata (depois da abertura a pelada já existe; antes, `sorteio`/`partidas` = null).

- [ ] **Step 1: testes do resumo** em `tests/server/painel.test.ts` (createTestDb, datas fixas como em `tests/server/presencas.test.ts`):
  - `domingo antes de abrir, com 15 mensalistas de novembro: lista.estado 'antes', confirmados 0, naFila 0, mensalistas.marcados 15, sorteio null, partidas null, e nada é gravado (peladas vazia)`
  - `segunda com 3 confirmados e 2 na fila: lista.estado 'aberta', confirmados 3, naFila 2`
  - `lista fechada à mão / cancelada: estado 'fechada' / 'cancelada'`
  - `quarta com times salvos e 2 partidas encerradas e 1 em andamento: sorteio.definidos true, partidas.jogadas 2, emAndamentoId = id da aberta`
  - `jogadores: conta só ativos; pinPadrao conta quem tem pin_hash nulo`
- [ ] **Step 2:** rodar `pnpm vitest run tests/server/painel.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** implementar `resumoDoPainel` em `src/server/painel.ts`.
- [ ] **Step 4:** rodar de novo → PASS. Commit `feat: resumo da semana para o painel do admin`.
- [ ] **Step 5:** Painel (`page.tsx`) mostra o resumo em todas as larguras: um bloco por assunto (placa #111, raio 10px), cada um um link inteiro para a seção, com o número principal em Barlow (como o "x/16") e uma frase em #b4b4b4. Em `lg`, os blocos em grade. Partida em andamento: atalho para o anotador. Commit.
- [ ] **Step 6:** moldura lateral em `lg` (layout + nav + Tela). Conteúdo alinhado no alto em `lg`. O anotador continua sem menu. Commit.
- [ ] **Step 7:** Mensalistas em `lg`: nomes em 3–4 colunas, mês/contador/Desfazer/Salvar no alto (sem barra presa no rodapé em `lg`). Admins em `lg`: seções em duas colunas. Commit.
- [ ] **Step 8:** `tests/e2e/admin-pc.spec.ts` com viewport 1440×900 (`test.use({ viewport, isMobile: false, hasTouch: false })`): entra como admin; o menu lateral mostra as 7 seções e marca a atual; navega por Painel → Pelada → Sorteio → Partidas → Jogadores → Mensalistas → Admins sem rolagem lateral da página (`document.documentElement.scrollWidth <= innerWidth`); no Painel o bloco da lista mostra "x/16". Rodar `pnpm test:e2e` → todas passam. Commit.
- [ ] **Step 9:** DESIGN.md: seção "No PC (≥1024px)" (moldura, painel resumo, mensalistas, admins). Capturas 1440/1024/390, detector, lint/typecheck/test/e2e. Commit.

### Task 2: Pelada e Jogadores (PR 2, branch `feature/admin-pc-pelada`, base `feature/admin-pc-base`)

**Files:**
- Modify: `src/app/admin/(area)/pelada/pelada-admin.tsx`, `src/app/admin/(area)/jogadores/jogadores-admin.tsx` (e componentes irmãos novos na mesma pasta, se a tabela pedir)
- Modify: `tests/e2e/admin-pc.spec.ts`, `DESIGN.md`

**Interfaces:**
- Consumes: a moldura da Task 1 (conteúdo ocupa a coluna inteira em `lg`); ações existentes `mudarEstado`, `adicionar`, `confirmarPor`, `tirar`, `buscar` (`pelada/acoes.ts`); ações e seletor de nota existentes de `jogadores` (mesma regra de salvar 500 ms depois do último toque e ao sair).
- Produces: nada que outra tarefa consuma.

- [ ] **Step 1:** Pelada em `lg`: duas colunas — esquerda: cabeçalho "Lista x/16" e as 16 linhas (abrem no lugar, como hoje); direita: "Pôr alguém na lista" (busca), Fila, "Perderam o prazo", "Estado da lista". Abaixo de `lg`, ordem e aparência atuais. Commit.
- [ ] **Step 2:** Jogadores em `lg`: tabela com cabeçalho (Nome · Nota · PIN), uma linha por jogador; a nota com o seletor (− valor +) na própria linha, salvando sozinho; situação do PIN em Giz ("Ainda 1234" / "Trocado") ; clicar no nome abre logo abaixo da linha o editor que existe hoje (nome, zerar PIN, desativar/reativar). Busca e "Adicionar jogadores" no alto; o painel de colar nomes abre ao lado ou acima da tabela, sem cobrir. Só uma linha aberta por vez. Abaixo de `lg`, as linhas recolhíveis de hoje. Commit.
- [ ] **Step 3:** e2e (1440×900): na Pelada, a fila aparece à direita da lista (x da Fila > x da Lista); em Jogadores, mudar a nota de um jogador pela linha e recarregar mostra a nota nova. Commit.
- [ ] **Step 4:** DESIGN.md "No PC" (Pelada, Jogadores); capturas, detector, lint/typecheck/test/e2e. Commit.

### Task 3: Sorteio, Partidas e Corrigir partida (PR 3, branch `feature/admin-pc-sorteio`, base `feature/admin-pc-pelada`)

**Files:**
- Modify: `src/app/admin/(area)/sorteio/sorteio-admin.tsx`, `src/app/admin/(area)/sorteio/complete.tsx`, `src/app/admin/(area)/sorteio/busca-de-jogador.tsx`
- Modify: `src/app/admin/(area)/partidas/partidas-admin.tsx`, `src/app/admin/(area)/partidas/escolher-quem-completa.tsx`
- Modify: `src/app/admin/(area)/partida/[id]/corrigir/Correcao.tsx`
- Modify: `tests/e2e/admin-pc.spec.ts`, `DESIGN.md`

**Interfaces:**
- Consumes: moldura da Task 1; todo o estado e as ações atuais do sorteio (escolher, trocar, mover, COMPLETE, sortear de novo, confirmação com partidas jogadas) e das partidas (fila, escolha livre, quem completa, iniciar).
- Produces: nada.

- [ ] **Step 1:** Sorteio em `lg`: "Quem joga" (busca + linhas de marcar) numa coluna estreita à esquerda; à direita, cabeçalho com Diferença e as ações (Sortear N em 4 times / Marcar como definitivo / Sortear de novo / confirmação "Usar os times novos"), e os times lado a lado (4 colunas; 5 times quebram em grade sem cortar). Times definitivos: "Quem joga" vira o que hoje aparece (sem coluna vazia). Escolher jogador ou COMPLETE abre as opções num painel ao lado dos times (sem cobrir o time escolhido); fechar/cancelar volta. O mesmo estado serve as duas larguras (redimensionar não perde a escolha). Abaixo de `lg`, tudo como hoje (barra e folhas no rodapé). Commit.
- [ ] **Step 2:** Partidas em `lg`: coluna esquerda com "Ficou aberta", "Em andamento" e "Próxima partida" (os times da fila numa linha de 4, a pílula Iniciar); "Quem completa" e "Conferência" ocupam essa coluna; coluna direita com "Já jogadas". Corrigir partida em `lg`: os dois times lado a lado. Commit.
- [ ] **Step 3:** e2e (1440×900): sortear 14 em 4 times mostra os 4 cartões na mesma linha (mesmo y); escolher um jogador abre o painel ao lado e trocar com outro time funciona; em Partidas, iniciar uma partida com COMPLETE passa pelo "Quem completa" e chega ao anotador. Commit.
- [ ] **Step 4:** DESIGN.md "No PC" (Sorteio, Partidas, Corrigir); capturas, detector, lint/typecheck/test/e2e. Commit.
