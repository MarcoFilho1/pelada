# COMPLETE e "Sortear de novo" — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o admin sortear de novo depois de partidas jogadas e completar times curtos com vagas "COMPLETE", preenchidas por alguém fixo no time ou por partida.

**Architecture:** Mesma base do plano principal (`2026-11-04-pelada.md`): regras puras em `src/domain/`, servidor em `src/server/` com transações que travam a linha da pelada, telas em `src/app/admin/(area)/`. Times antigos passam a ser **arquivados** (`times.arquivado_em`) em vez de apagados quando já têm partida; COMPLETE é uma linha em `time_completes`; quem completa uma partida entra na foto do elenco (`partida_jogadores`) com `completando = true`, e por isso o ranking não muda.

**Tech Stack:** a do projeto (Next.js 16, React 19, TS strict, Tailwind v4, Drizzle + drizzle-kit, PGlite nos testes, Vitest, Playwright).

**Spec:** `docs/superpowers/specs/2026-11-05-complete-e-resortear-design.md` (adendo de `docs/superpowers/specs/2026-11-04-pelada-design.md`).

## Global Constraints

- Tudo do plano principal continua valendo (fuso -03:00, 4 times de 4, nota 0 a 5 passo 0,5, pt-BR, sem atribuição de IA, impeccable + taste-skill em toda tela, encerrar dev server/navegador headless no fim).
- Nota automática do COMPLETE: só **2,5, 3,0 ou 3,5**. Nota editada pelo admin: **0 a 5, passo 0,5**.
- COMPLETE completa até **4 por time**; todo time tem **pelo menos 1 jogador de verdade**.
- Partidas já jogadas nunca mudam por causa de um sorteio novo, de mexer em COMPLETE ou de mover jogador.
- Nada de `window.confirm`/`alert`: confirmações são na própria tela.
- Branch `feature/complete-resortear` (a partir de `feature/deploy`), PR com base `feature/deploy`.

## Review Focus

1. **Sortear de novo com partidas jogadas:** histórico, ranking e a página da partida antiga mostram os times da época (cores e jogadores). → teste na Task 17.
2. **Fila de times depois do sorteio novo:** começa na ordem do sorteio novo, ignorando partidas dos times arquivados (que teriam ids desconhecidos). → teste na Task 17.
3. **Quem completa já está num dos dois times da partida** (ou foi escolhido duas vezes): recusar. → teste na Task 18.
4. **COMPLETE quando um time ficaria só de COMPLETEs** (ex.: 5 presentes em 4 times): o sorteio nunca gera isso. → teste na Task 16.
5. **Mover jogador depois do sorteio novo:** só mexe nos times atuais; os vínculos dos times arquivados ficam intactos. → teste na Task 17.

---

## Modelo de dados (Task 17 cria a migração `0004`)

| Mudança | Detalhe |
|---|---|
| `times.arquivado_em` | `timestamptz` null. Null = time atual da pelada. |
| `time_completes` (nova) | `id` serial PK, `time_id` → `times.id` not null, `nota` numeric(2,1) not null |
| `partida_jogadores.completando` | `boolean` not null default `false` |

---

## Parte 8 — COMPLETE e sortear de novo · `feature/complete-resortear` · PR 8

### Task 16: Sorteio com COMPLETE (domínio puro)

**Files:** Modify `src/domain/sorteio.ts` · Test `tests/domain/sorteio.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const NOTAS_COMPLETE = [2.5, 3, 3.5] as const
  export type TimeSorteado = { jogadores: JogadorNota[]; completes: number[] /* notas */; soma: number /* jogadores + completes */ }
  sortearComCompletes(jogadores: JogadorNota[], opts?: { times?: number /* 4 */; porTime?: number /* 4 */; tentativas?: number; rng?: () => number }): TimeSorteado[]
  ```
  `sortearTimes` continua exportado e passa a devolver `completes: []`. `diferenca`, `diferencaMedia` e `rotuloDaDiferenca` passam a considerar o tamanho do time como `jogadores.length + completes.length`.
- Algoritmo: `nTimes = min(times, n)`; `k = max(0, nTimes*porTime − n)`. `k = 0` → `sortearTimes`. Senão, para cada multiconjunto de `k` notas em `NOTAS_COMPLETE` (combinações com repetição), sortear com `k` jogadores fictícios (ids negativos) e guardar o melhor custo; descartar divisões com time sem jogador real; escolher o menor custo, no empate a menor soma de `|nota − 3|`, depois o `rng`. Divida as `tentativas` entre as combinações (mínimo 200 cada). Os fictícios viram `completes` no resultado.
- [ ] **Step 1:** Testes (rng de semente fixa):
  - 14 jogadores → 4 times; `jogadores.length + completes.length === 4` em todos; 2 completes no total; ids reais todos presentes uma vez.
  - Toda nota de complete ∈ {2,5; 3; 3,5}.
  - 5 jogadores, 4 times → nenhum time com `jogadores.length === 0` (Review Focus 4).
  - 16 jogadores → nenhum complete (mesmo resultado de `sortearTimes` com o mesmo rng).
  - 14 jogadores de nota 2,0 → completes com nota 2,5 (a mais próxima do equilíbrio); 14 de nota 4,5 → completes 3,5.
  - `diferenca` conta a nota dos completes na soma.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** Commit `feat: sorteio completa times curtos com COMPLETE`.

### Task 17: Times arquivados, COMPLETE no servidor e sortear de novo com partidas

**Files:** Modify `src/db/schema.ts`, `src/server/times.ts`, `src/server/partidas.ts` (só `filaDeTimes` e leituras de times atuais) · Create `drizzle/0004_*.sql` (via `pnpm db:generate`) · Test `tests/server/times.test.ts`, `tests/server/partidas.test.ts`

**Interfaces:**
- Consumes: `TimeSorteado` da Task 16.
- Produces (`times.ts`):
  - `type CompleteDoTime = { id: number; nota: number }`; `TimeDaPelada` ganha `completes: CompleteDoTime[]`.
  - `salvarTimesDefinitivos(db, peladaId, elencos: number[][], completes: number[][] = [], now = new Date())` — `completes[i]` = notas dos COMPLETE do time `i`. Sem partida na pelada: apaga os antigos como hoje (inclusive `time_completes`). Com partida: **arquiva** os atuais (`arquivado_em = now`), mantendo `time_jogadores`. Partida em andamento → `ErroTimes('partida_em_andamento')`. Remove o motivo `ja_tem_partida`. Time sem jogador real → `time_vazio`. Nota fora de 0–5/passo 0,5 → `nota_invalida`.
  - `timesDaPelada` e `moverJogador`: só times atuais (`arquivado_em is null`); time arquivado → `time_inexistente`.
  - `partidasJogadas(db, peladaId): Promise<{ jogadas: number; emAndamento: boolean }>` (substitui `temPartida`; atualizar quem usa).
  - `adicionarComplete(db, timeId, nota): Promise<number>`, `removerComplete(db, completeId)`, `mudarNotaComplete(db, completeId, nota)`, `preencherComplete(db, completeId, jogadorId)` — todas travam a pelada; time arquivado → `time_inexistente`; `preencherComplete` recusa jogador inativo (`jogador_inativo`) ou já num time atual (`ja_tem_time`), apaga o COMPLETE e põe o jogador no time, na mesma transação; adicionar recusa se o time já tem 4 entre jogadores e completes (`time_cheio`).
- Produces (`partidas.ts`): `filaDeTimes` parte dos times atuais e só aplica partidas encerradas cujos dois times são atuais.
- [ ] **Step 1:** Testes:
  - Pelada com 1 partida encerrada → `salvarTimesDefinitivos` de novo funciona; `timesDaPelada` traz só os novos; `historicoDaPelada` e `partidaAoVivo` da partida antiga ainda trazem as cores antigas; `rankingDoPeriodo` igual antes e depois (Review Focus 1).
  - Com partida em andamento → `partida_em_andamento`.
  - `filaDeTimes` depois do sorteio novo = ids dos novos na ordem 1..4 (Review Focus 2).
  - `moverJogador` depois do sorteio novo não apaga `time_jogadores` dos arquivados (Review Focus 5).
  - `salvarTimesDefinitivos(…, [[1,2,3],[4,5,6,7]], [[3],[]])` → time 1 com um complete de nota 3,0.
  - `preencherComplete` com jogador sem time → vira jogador do time e o complete some; com jogador que já está noutro time atual → `ja_tem_time`.
  - `adicionarComplete` em time com 4 → `time_cheio`; `mudarNotaComplete(…, 5.5)` → `nota_invalida`.
- [ ] **Step 2–4:** FAIL → implementar (schema + `pnpm db:generate`) → PASS. **Step 5:** Commit `feat: times arquivados no sorteio novo e COMPLETE no servidor`.

### Task 18: Quem completa a partida

**Files:** Modify `src/server/partidas.ts` · Test `tests/server/partidas.test.ts`

**Interfaces:**
- Consumes: `time_completes`, `partida_jogadores.completando` (Task 17).
- Produces:
  - `iniciarPartida(db, peladaId, timeAId, timeBId, now, completam: { A: number[]; B: number[] } = { A: [], B: [] })` — `completam.A.length` ≤ COMPLETEs do time A (idem B), senão `completes_demais`; cada id é jogador ativo, não está em nenhum dos dois times da partida e não se repete, senão `completa_invalido`. Grava esses jogadores em `partida_jogadores` com o lado e `completando = true`. Menos ids que COMPLETEs = "jogar sem".
  - `partidaAoVivo`: cada jogador do lado ganha `completando: boolean`.
  - `quemPodeCompletar(db, peladaId, timeAId, timeBId): Promise<{ deFora: JogadorNota[]; semTime: JogadorNota[] }>` — `deFora` = jogadores dos times atuais que não são A nem B; `semTime` = ativos sem time atual. Ordem por nome.
- [ ] **Step 1:** Testes: completar com jogador do time C → entra na foto com `completando` e lado certo, e um gol dele conta no placar do lado; completar com jogador do próprio time A ou B → `completa_invalido` (Review Focus 3); mesmo id duas vezes → `completa_invalido`; dois ids para um COMPLETE → `completes_demais`; sem ids com COMPLETE → inicia com o elenco sem ninguém extra; ranking conta V/gol para quem completou.
- [ ] **Step 2–4:** FAIL → implementar → PASS. **Step 5:** Commit `feat: escolher quem completa a partida`.

### Task 19: Tela de sorteio (COMPLETE e sortear de novo)

**Files:** Modify `src/app/admin/(area)/sorteio/page.tsx`, `sorteio-admin.tsx`, `acoes.ts` · Test `tests/e2e/sorteio-complete.spec.ts` (novo)

**Interfaces:**
- Consumes: `sortearComCompletes` (Task 16); `salvarTimesDefinitivos`, `partidasJogadas`, `adicionarComplete`, `removerComplete`, `mudarNotaComplete`, `preencherComplete` (Task 17).
- [ ] **Step 1:** Ações: `sortear` usa `sortearComCompletes`; `marcarDefinitivo(peladaId, times, completes)`; novas ações finas para as quatro operações de COMPLETE (validam ids e nota como as atuais).
- [ ] **Step 2:** Tela (impeccable + taste-skill antes de codar):
  - Proposta e definitivo mostram o COMPLETE no cartão do time, distinto de um jogador, com a nota; a soma do time inclui a nota.
  - Tocar num COMPLETE abre a folha: mudar nota (0–5, passo 0,5), tirar e, no definitivo, "Pôr alguém" (busca entre ativos sem time atual + cadastro rápido existente).
  - Pôr um COMPLETE num time com menos de 4.
  - "Sortear de novo" sempre visível no definitivo. Com partidas jogadas, a confirmação na tela antes de marcar o novo como definitivo: "As N partidas já jogadas ficam como estão. Os times novos valem daqui pra frente." Com partida em andamento: botão de marcar desabilitado com o motivo.
- [ ] **Step 3:** e2e (390×844): admin com 14 confirmados sorteia → aparecem 2 COMPLETE; marca definitivo; põe um jogador sem time no lugar de um COMPLETE. Seed próprio no `semear.ts` só se precisar de pelada nova (não quebrar os 5 specs existentes).
- [ ] **Step 4:** Crítica das skills, correções. `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`. Commit `feat: COMPLETE e sortear de novo na tela de sorteio`.

### Task 20: Partidas e anotador com quem completa

**Files:** Modify `src/app/admin/(area)/partidas/page.tsx`, `partidas-admin.tsx`, `acoes.ts`, `src/app/admin/(area)/partida/[id]/Anotador.tsx` (e o que ele usa para receber `completando`) · Test `tests/e2e/anotador.spec.ts` (estender) ou novo spec

**Interfaces:**
- Consumes: `iniciarPartida(…, completam)`, `quemPodeCompletar`, `partidaAoVivo` com `completando` (Task 18); `timesDaPelada` com `completes` (Task 17).
- [ ] **Step 1:** Ação `iniciar(peladaId, timeAId, timeBId, completam)` valida o formato; nova ação/leitura para `quemPodeCompletar`.
- [ ] **Step 2:** Tela de partidas (impeccable + taste-skill): ao tocar em Iniciar com COMPLETE em algum dos dois times, um passo "Quem completa o <Cor>?" por COMPLETE: primeiro `deFora`, depois `semTime` com busca, e "Jogar sem". Iniciar só depois de cada COMPLETE ter escolha. Os cartões de times mostram os COMPLETE.
- [ ] **Step 3:** Anotador: quem completa tem GOL/AST como os outros e a marca "completando"; o layout continua cabendo em 390×664 e 360×640 sem rolar (regra do P5-c).
- [ ] **Step 4:** e2e: partida com COMPLETE, escolher alguém do time de fora, marcar gol dele, placar sobe. Crítica das skills. `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`. Commit `feat: quem completa nas partidas e no anotador`. Abrir PR 8 (base `feature/deploy`).
