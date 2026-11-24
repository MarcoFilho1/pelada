# Auto-revisão do robô — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o robô guarda as conversas por 7 dias, se revisa seg/ter/qua às 23:00 com o Claude Code, avisa o Marco sempre e, com "pode mergear", junta e se reinicia sozinho.

**Architecture:** o robô (Node) só lê e escreve arquivos numa pasta de troca (`~/Library/Logs/PeladaRobo/revisao/`); a revisão (`claude -p` agendado no launchd) e o merge (script solto do robô) conversam com ele por esses arquivos. Lógica pura em `src/robo/diario.ts` e `src/robo/revisao.ts`; a fiação em `principal.ts`; o resto em `scripts/revisao/`.

**Tech Stack:** TypeScript (esbuild, vitest), zsh, launchd, Claude Code CLI 2.1.x, gh.

**Spec:** `docs/superpowers/specs/2026-11-24-robo-auto-revisao-design.md`

## Global Constraints
- Conversas: `~/Library/Logs/PeladaRobo/conversas/AAAA-MM-DD.jsonl`, apagadas com mais de **7 dias**; nome, nunca telefone.
- Revisão: **segunda, terça e quarta às 23:00** (launchd `Weekday` 1, 2, 3; `Hour` 23; `Minute` 0); no máximo **45 min**; no máximo **um PR por noite**.
- Sempre avisa o dono (1º número de `ROBO_ADMINS`) no privado, inclusive "nada a melhorar" e falhas.
- Só "pode mergear" (sem acento/caixa/espaços extras), só do dono, só no privado, só com revisão pendente.
- A revisão nunca faz merge, nunca mexe nos limites anti-ban, nunca grava no banco de produção, nunca põe segredo/telefone no repo.
- Nada que o launchd rode pode morar em `~/Desktop` (TCC): clone da revisão em `~/pelada-revisao`.
- Commits sem `Co-Authored-By`; PRs sem "Generated with Claude Code"; textos e comentários em pt-BR.

## Review Focus
1. "pode mergear" sem revisão pendente, ou de outro organizador → segue o caminho normal (parser/IA), sem merge.
2. `resultado.json` ilegível ou sem campos → o dono recebe "a revisão falhou" e o robô não cai.
3. Script de merge morre sem escrever `merge.json` → depois de 30 min o dono recebe "o merge não respondeu".
4. Falha ao gravar o diário (disco, permissão) nunca impede a resposta.
5. `claude -p` passa dos 45 min ou sai sem escrever o resultado → `rodar.sh` escreve `status: 'falhou'` com o motivo.

---

### Task 1: Diário de conversas

**Files:**
- Create: `src/robo/diario.ts`
- Modify: `src/robo/principal.ts` (`tratarPedido`, partida e virada do dia na volta)
- Test: `tests/robo/diario.test.ts`

**Interfaces:**
- Produces:
  - `type EntradaDoDiario = { quando: string; onde: 'grupo' | 'privado'; quem: string | null; recebido: string; enviado: string[]; erro?: string }`
  - `registrarConversa(pasta: string, e: EntradaDoDiario): void` — acrescenta uma linha JSON em `<pasta>/<AAAA-MM-DD de e.quando, hora de Recife>.jsonl`; cria a pasta; nunca lança (erro vai para `console.error`).
  - `limparDiario(pasta: string, agora: Date, dias = 7): string[]` — apaga `*.jsonl` cuja data do nome é anterior a `agora - dias`; devolve os nomes apagados; ignora outros arquivos.
  - `PASTA_DO_DIARIO = join(homedir(), 'Library/Logs/PeladaRobo/conversas')`

- [ ] **Step 1: testes que falham** (pasta temporária com `mkdtempSync`)
  - `registra uma linha por conversa no arquivo do dia`: duas chamadas com `quando` em 2026-11-24 → arquivo `2026-11-24.jsonl` com 2 linhas, `JSON.parse` igual às entradas.
  - `usa o dia de Recife`: `quando: '2026-11-25T01:30:00.000Z'` → arquivo `2026-11-24.jsonl`.
  - `não lança se a pasta não puder ser criada`: `pasta` = caminho dentro de um arquivo comum → `expect(() => …).not.toThrow()`.
  - `apaga só os arquivos com mais de 7 dias`: arquivos `2026-11-16.jsonl`, `2026-11-17.jsonl`, `2026-11-24.jsonl`, `notas.txt`; `limparDiario(p, new Date('2026-11-24T12:00:00-03:00'))` → devolve `['2026-11-16.jsonl']`; os outros ficam.
- [ ] **Step 2:** `pnpm vitest run tests/robo/diario.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** implementar `diario.ts` (use `dataDe` de Recife já usado em `principal.ts`, se exportável; senão `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife' })`).
- [ ] **Step 4:** fiação em `principal.ts`: em `tratarPedido`, envolver `enviar` e `enviarPartes` para juntar em `enviado: string[]` o que de fato saiu; depois do `responder` (e no `catch`, com `erro`), `registrarConversa(PASTA_DO_DIARIO, { quando: m.quando.toISOString(), onde: m.privado ? 'privado' : 'grupo', quem: m.remetenteNome, recebido: m.texto, enviado, erro })`. Só grava quando `r` existe ou deu erro (marcação ignorada não). `limparDiario` na partida e quando a data de Recife muda na volta.
- [ ] **Step 5:** `pnpm vitest run` + `pnpm tsc --noEmit` → verdes.
- [ ] **Step 6:** commit `feat(robo): diário das conversas por 7 dias`.

### Task 2: Caixa da revisão (lógica pura)

**Files:**
- Create: `src/robo/revisao.ts`
- Test: `tests/robo/revisao.test.ts`

**Interfaces:**
- Produces:
  - `type Problema = { vi: string; corrigi: string }`
  - `type ResultadoDaRevisao = { quando: string; status: 'nada' | 'pr' | 'falhou'; pr?: number; url?: string; problemas?: Problema[]; motivo?: string }`
  - `type ResultadoDoMerge = { quando: string; status: 'ok' | 'falhou'; pr: number; motivo?: string }`
  - `ehPodeMergear(texto: string): boolean` — `normalizarNome(texto).replace(/[!.\s]+/g, ' ').trim() === 'pode mergear'`.
  - `avisoDaRevisao(r: ResultadoDaRevisao): string[]` — partes curtas:
    - `nada`: `['🔎 Revisão de hoje: nada a melhorar. Tudo certo por aqui.']`
    - `falhou`: `['⚠️ A revisão de hoje falhou: <motivo>.']`
    - `pr`: `['🔎 Revisão de hoje: achei <n> coisa(s) para melhorar.', …uma parte por problema: '<i>. O que vi: <vi>\nComo corrigi: <corrigi>', 'PR: <url>\n\nSe estiver bom, responda *pode mergear* que eu junto e me atualizo.']`
  - `avisoDoMerge(r: ResultadoDoMerge): string` — `ok`: `'✅ PR #<pr> juntado. Estou no ar com a correção.'`; `falhou`: `'⚠️ Não juntei o PR #<pr>: <motivo>. Nada mudou.'`
  - `class CaixaDaRevisao { constructor(pasta: string, agora: () => Date) }` com arquivos `resultado.json`, `pendente.json`, `mergeando.json`, `merge.json`:
    - `novoResultado(): ResultadoDaRevisao | null` — lê e consome `resultado.json`; ilegível/inválido → `{ status: 'falhou', motivo: 'o resultado da revisão veio ilegível' }`; `status: 'pr'` com `pr` → grava como `pendente.json` (substitui).
    - `comecarMerge(): number | null` — `pendente.json` → `mergeando.json` (com `desde`), devolve o número do PR; sem pendente → `null`.
    - `resultadoDoMerge(): ResultadoDoMerge | null` — consome `merge.json` e apaga `mergeando.json`; sem `merge.json` e `mergeando.json` com mais de **30 min** → apaga e devolve `{ status: 'falhou', pr, motivo: 'o merge não respondeu em 30 min' }`.

- [ ] **Step 1: testes que falham**, um por item: `ehPodeMergear` (`'Pode mergear'`, `'pode   mergear!'` → true; `'pode mergear o 3?'`, `'mergear'` → false); `avisoDaRevisao` nos três status com as partes exatas acima; `avisoDoMerge` nos dois; caixa: resultado `nada` não deixa pendente; `pr` vira pendente e some de `resultado.json`; JSON quebrado → `falhou`; `comecarMerge` sem pendente → `null`, com → número e pendente some; `resultadoDoMerge` com `merge.json`; com `mergeando.json` de 31 min atrás → falhou por tempo; de 10 min → `null`.
- [ ] **Step 2:** rodar → FAIL. **Step 3:** implementar. **Step 4:** verdes.
- [ ] **Step 5:** commit `feat(robo): caixa de arquivos da auto-revisão`.

### Task 3: Fiação no robô (aviso e "pode mergear")

**Files:**
- Modify: `src/robo/principal.ts`
- Create: `scripts/revisao/mergear.sh`

**Interfaces:**
- Consumes: Task 2 inteira; `avisarOrganizadores(texto, admins.slice(1))` (só o dono), `enviarPartesNoPrivado`.
- Produces: `scripts/revisao/mergear.sh <pr>` — escreve `merge.json` sempre.

- [ ] **Step 1:** `const caixa = new CaixaDaRevisao(join(homedir(), 'Library/Logs/PeladaRobo/revisao'), () => new Date())`. Na partida e a cada volta: `novoResultado()` → manda `avisoDaRevisao` ao dono (cada parte como mensagem; pelo ZapGate, numa entrega só via conversa do dono); `resultadoDoMerge()` → manda `avisoDoMerge`. Falha de envio: loga e devolve o arquivo (para tentar na volta seguinte) — basta só consumir depois de enviar com sucesso.
- [ ] **Step 2:** em `tratarPedido`, antes do `responder`: se `m.privado`, remetente é `admins[0]` e `ehPodeMergear(m.texto)`, chama `caixa.comecarMerge()`; se veio número: responde `'⏳ Juntando o PR #<n>: rodo os testes, junto e me reinicio. Te aviso quando voltar.'`, solta `spawn('/bin/zsh', [join(repo, 'scripts/revisao/mergear.sh'), String(n)], { detached: true, stdio: ['ignore', fdDoLog, fdDoLog] }).unref()` e retorna; se `null`, segue o caminho normal.
- [ ] **Step 3:** `mergear.sh <pr>` (zsh, `set -u`, sem `set -e`; cada falha escreve `merge.json` com `status: falhou` e o motivo, e sai):
  1. em `~/pelada-revisao`: `git fetch`, `gh pr checkout <pr>`, `pnpm install --frozen-lockfile`, `pnpm vitest run` (passo separado; falhou → "os testes falharam").
  2. `gh pr merge <pr> --merge --delete-branch`; depois `gh pr create --base main --head develop` e `gh pr merge` desse; confere `git diff --quiet origin/develop origin/main`.
  3. grava `merge.json` `ok` **antes** de reiniciar; `cd ~/pelada && git pull --ff-only && scripts/robo-reiniciar.sh`.
- [ ] **Step 4:** teste manual com um PR de mentira? Não: verificar só que o processo solto sobrevive ao `kickstart -k` — rodar o robô, disparar um `mergear.sh` com `sleep 20; echo vivo >> /tmp/...` trocado à mão numa cópia local, reiniciar, conferir. Se não sobreviver, trocar o spawn por `launchctl submit -l com.pelada.mergear -- …`.
- [ ] **Step 5:** `pnpm vitest run` + `tsc` verdes; commit `feat(robo): aviso da revisão e "pode mergear"`.

### Task 4: Revisão agendada

**Files:**
- Create: `scripts/revisao/rodar.sh`, `scripts/revisao/PROMPT.md`, `scripts/revisao/instalar.sh`

- [ ] **Step 1: `PROMPT.md`** — papel: revisor do robô da Pelada. Entradas (caminhos via variáveis que `rodar.sh` exporta): conversas do dia, trecho do dia do `robo.log`, `gate.db` em modo só leitura (`sqlite3 -readonly`, tabela `activity`). Roteiro: achar respostas erradas/mensagens ignoradas/erros/textos estranhos → para cada um, causa raiz, teste que falha, correção, `pnpm vitest run` + `pnpm tsc --noEmit` verdes → uma branch `revisao/AAAA-MM-DD`, um commit por problema, um PR na develop. As regras de "Global Constraints" literalmente. Fim obrigatório: escrever `$REVISAO_DIR/resultado.json` no formato `ResultadoDaRevisao` (com `vi`/`corrigi` em pt-BR simples, para o Marco), inclusive `nada`.
- [ ] **Step 2: `rodar.sh`** — trava (`mkdir` lock); garante o clone `~/pelada-revisao` (clona se não existe), `git fetch && git checkout develop && git reset --hard origin/develop && git clean -fd` (clone só dela), `pnpm install --frozen-lockfile`; exporta `REVISAO_DIR`, `CONVERSAS`, `ROBO_LOG`, `GATE_DB`; roda `claude -p "$(cat PROMPT.md)" --permission-mode acceptEdits --allowedTools "Read Edit Write Grep Glob Bash(pnpm:*) Bash(git:*) Bash(gh pr create:*) Bash(gh pr view:*) Bash(sqlite3 -readonly:*) Bash(cat:*) Bash(tail:*)" --disallowedTools "Bash(gh pr merge:*)"` com limite de 45 min (laço com `kill` após 2700 s); se não houver `resultado.json` depois, escreve `{status:'falhou', motivo}` (tempo esgotado / saiu sem resultado / código de saída). Log em `~/Library/Logs/PeladaRobo/revisao.log`.
- [ ] **Step 3: `instalar.sh`** — grava `~/Library/LaunchAgents/com.pelada.revisao.plist` (`StartCalendarInterval` = três dicts Weekday 1/2/3, Hour 23, Minute 0; `PATH` com node, pnpm, claude, gh, sqlite3; `ProgramArguments` = zsh + `~/pelada/scripts/revisao/rodar.sh`) e `launchctl bootstrap`.
- [ ] **Step 4:** `zsh -n` nos três scripts; commit `feat(robo): revisão agendada seg/ter/qua 23:00`.

### Task 5: Rodada de verdade
- [ ] PR → develop → main (com autorização do Marco), `git pull` em `~/pelada`, reiniciar robô, `scripts/revisao/instalar.sh`.
- [ ] `launchctl kickstart gui/$UID/com.pelada.revisao` uma vez (confirma login do `claude` dentro do launchd); conferir `revisao.log`, `resultado.json` e a mensagem chegando no privado do Marco. Se o login falhar no launchd, registrar e resolver (ex.: `claude setup-token` feito pelo Marco).
