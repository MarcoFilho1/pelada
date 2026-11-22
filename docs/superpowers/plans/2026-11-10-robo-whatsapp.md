# Robô do WhatsApp — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um programa que roda no Mac, conectado (Baileys) a um número de WhatsApp, e manda a lista da pelada no grupo "Pelada 3.0" nos horários do desenho, com um cabeçalho do que mudou.

**Architecture:** três camadas. (1) Regras puras e testadas: foto da lista, diferença entre fotos, cabeçalho, agenda (quando falar) e texto da mensagem. (2) Execução: um laço de 1 minuto que lê a lista no banco do site (funções do próprio site), pergunta à agenda o que fazer, manda pelo WhatsApp e guarda o estado num arquivo no Mac. (3) Instalação no macOS (serviço de login, Mac acordado só na janela da semana).

**Tech Stack:** Node 22 + TypeScript (tsx), Baileys (pacote npm `baileys`, versão exata fixada, publicada há pelo menos 2 semanas), Drizzle/pg já existentes (`getDb`), Vitest. Mesmo repositório, pasta `src/robo/`.

**Spec:** `docs/superpowers/specs/2026-11-10-robo-whatsapp-design.md`

## Global Constraints

- Fuso de Recife (UTC−3), usando as funções de `src/domain/tempo.ts` (`proximaQuarta`, `aberturaLista`, `prazoMensalista`, `inicioJogo`, `diaMes`).
- A lista na mensagem é **exatamente** `textoWhatsApp(estado, data)` (`src/domain/copiarLista.ts`).
- Horários: "lista aberta" **segunda 14:00**; rodadas nos minutos **:00 e :30** até **quarta 20:30** (`inicioJogo`); lembrete **quarta 12:00**; prazo **quarta 14:00** (`prazoMensalista`); silêncio **23:00–08:00** (o que mudar vai na rodada das 08:00).
- Nunca mandar mensagem sem mudança (exceto as de horário fixo do desenho); nunca uma mensagem por mudança.
- O robô não grava nada no banco além do que `estadoDaSemana` já faz (criar a pelada da semana depois da abertura).
- Estado e login do WhatsApp ficam fora do repositório: `~/Library/Application Support/PeladaRobo/` (`estado.json`, `auth/`, `.env` com `DATABASE_URL`). Nunca escrever senha ou URL de banco em arquivo do repositório nem em script.
- Grupo procurado pelo nome exato **"Pelada 3.0"**; dois grupos com o mesmo nome → para e pede para escolher.
- Textos em pt-BR, como no desenho (copiados verbatim abaixo onde o desenho fixa).
- Git: commits em pt-BR, **sem** linhas de atribuição a IA. Nada de `pkill` amplo (o PoupAI roda na porta 3000).
- Verificação: `pnpm lint`, `pnpm typecheck`, `pnpm test` limpos; o build do site (`pnpm build`) não pode passar a incluir `src/robo/` (nada do app importa de lá).

## Review Focus

1. Alguém confirma e sai dentro do mesmo intervalo → aparece só em "Saíram" (diferença líquida entre fotos, não histórico). Teste na Task 1.
2. Robô reiniciado no meio de uma rodada → a mesma rodada não sai duas vezes. Teste na Task 2.
3. Admin renomeia um jogador entre duas mensagens → diferença por `jogadorId`, sem "saiu/entrou"; usa o nome novo. Teste na Task 1.
4. Lista cheia: mensalista sai e o primeiro da fila sobe → "Saíram: X." e "Subiram da fila: Y.". Teste na Task 1.
5. Virada de semana: a última foto da semana passada não pode virar cabeçalho da semana nova (a primeira mensagem da semana não tem cabeçalho). Teste na Task 2.

---

### Task 1: Foto da lista, diferença e cabeçalho (puro)

**Files:**
- Create: `src/robo/foto.ts`
- Test: `tests/robo/foto.test.ts`

**Interfaces:**
- Consumes: `EstadoDaSemana` (`src/server/presencas.ts`: `principal`, `fila`, `foraDoPrazo: ItemLista[]`, `estadoManual`, `cancelada`, `data`), `ItemLista`.
- Produces:
  ```ts
  type Onde = 'confirmado' | 'pendente' | 'fila' | 'prazo';
  type FotoDaLista = {
    dataQuarta: string;                       // YYYY-MM-DD
    estadoManual: 'aberta' | 'fechada' | 'cancelada' | null;
    jogadores: Record<number, { nome: string; onde: Onde; tipo: 'M' | 'D' }>;
  };
  function fotografar(estado: EstadoDaSemana): FotoDaLista;
  type Mudancas = { confirmaram: string[]; sairam: string[]; entraramNaLista: string[]; subiramDaFila: string[]; foramParaFila: string[]; entraramNaFila: string[]; perderamPrazo: string[]; manual: 'fechou' | 'reabriu' | null };
  function mudancas(antes: FotoDaLista, depois: FotoDaLista): Mudancas;
  function haMudanca(m: Mudancas): boolean;
  function linhasDoCabecalho(m: Mudancas): string[];   // na ordem do desenho
  function juntarNomes(nomes: string[]): string;       // "A", "A e B", "A, B e C"
  ```
- Regras de `mudancas` (por `jogadorId`): pendente→confirmado = confirmaram; estava (lista/fila) e sumiu = sairam; ausente→lista = entraramNaLista; fila→lista = subiramDaFila; lista→fila = foramParaFila; ausente→fila = entraramNaFila; →prazo = perderamPrazo; `estadoManual` virou 'fechada' = 'fechou', saiu de 'fechada' para null/'aberta' = 'reabriu'. Nomes sempre da foto `depois` (ou `antes` para quem saiu), em ordem alfabética pt-BR.
- Textos de `linhasDoCabecalho` (verbatim, uma linha por tipo, só os não vazios, nesta ordem): `Confirmaram: ${nomes}.` · `Saíram: ${nomes}.` · `Entraram na lista: ${nomes}.` · `Subiram da fila: ${nomes}.` · `Foram para a fila: ${nomes}.` · `Entraram na fila: ${nomes}.` · `Perderam o prazo: ${nomes}.` · `O admin fechou a lista.` / `O admin reabriu a lista.`

- [ ] **Step 1: testes** em `tests/robo/foto.test.ts` montando `EstadoDaSemana` à mão:
  - `juntarNomes`: `[]→''`, `['Ana']→'Ana'`, `['Ana','Bia']→'Ana e Bia'`, `['Ana','Bia','Caio']→'Ana, Bia e Caio'`.
  - `confirmou`: Ana pendente → confirmado ⇒ `confirmaram: ['Ana']`, cabeçalho `['Confirmaram: Ana.']`.
  - `confirmou e saiu no mesmo intervalo` (Review Focus 1): Ana pendente antes, ausente depois ⇒ só `sairam: ['Ana']`.
  - `mensalista sai e diarista sobe` (Review Focus 4): ⇒ cabeçalho `['Saíram: X.', 'Subiram da fila: Y.']`.
  - `renomeado` (Review Focus 3): mesmo id, nome diferente, mesmo lugar ⇒ `haMudanca` false.
  - `entrou na lista com vaga`, `entrou na fila`, `perdeu o prazo` (item em `foraDoPrazo`), `admin fechou`/`reabriu`.
  - `ordem das linhas` com todos os tipos ao mesmo tempo, igual à lista do desenho.
- [ ] **Step 2:** `pnpm vitest run tests/robo/foto.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3:** implementar `src/robo/foto.ts`.
- [ ] **Step 4:** mesmo comando → PASS.
- [ ] **Step 5:** commit `feat: foto da lista e cabeçalho de mudanças para o robô`.

### Task 2: Agenda e texto da mensagem (puro)

**Files:**
- Create: `src/robo/agenda.ts`, `src/robo/mensagem.ts`
- Test: `tests/robo/agenda.test.ts`, `tests/robo/mensagem.test.ts`

**Interfaces:**
- Consumes: Task 1 (`FotoDaLista`, `mudancas`, `haMudanca`, `linhasDoCabecalho`, `juntarNomes`), `tempo.ts`, `textoWhatsApp`.
- Produces:
  ```ts
  type Envio = { quando: string; rodada: string; tipo: TipoMensagem; foto: FotoDaLista };   // rodada = ISO do :00/:30
  type EstadoDoRobo = { ultimo: Envio | null; aberturaEnviada: string | null /* dataQuarta */; grupoId: string | null };
  type TipoMensagem = 'abertura' | 'primeira' | 'rodada' | 'lembrete' | 'prazo' | 'cancelada' | 'voltou';
  function rodadaDe(now: Date): Date;   // arredonda para baixo ao :00/:30
  function decidir(now: Date, foto: FotoDaLista, estado: EstadoDoRobo): TipoMensagem | null;
  function montarMensagem(tipo: TipoMensagem, estadoDaSemana: EstadoDaSemana, foto: FotoDaLista, anterior: FotoDaLista | null): string;
  ```
- Regras de `decidir` (com `data = foto.dataQuarta`, `segunda14 = aberturaLista(data) + 14h`):
  - Fora de `[segunda14, inicioJogo(data))` → `null`. Dentro do silêncio (hora de Recife ≥ 23 ou < 8) → `null`.
  - Se `estado.ultimo?.rodada === rodadaDe(now).toISOString()` → `null` (Review Focus 2).
  - `anterior` = `estado.ultimo?.foto` só se `estado.ultimo.foto.dataQuarta === data`; senão nenhuma (Review Focus 5).
  - Cancelada agora e `anterior` não cancelada → `'cancelada'`; cancelada e já avisada → `null`; `anterior` cancelada e agora não → `'voltou'`.
  - `aberturaEnviada !== data` e ainda é a segunda (data de `now` = data de `segunda14`) → `'abertura'`.
  - Rodada atual = quarta 12:00 e há mensalista pendente na lista → `'lembrete'`; rodada atual = quarta 14:00 → `'prazo'` (sempre sai, mesmo sem ninguém perder).
  - Sem `anterior` → `'primeira'`.
  - `haMudanca(mudancas(anterior, foto))` → `'rodada'`; senão `null`.
- Textos de `montarMensagem` (verbatim; `dia` = `diaMes(data)`; depois do texto fixo, as linhas do cabeçalho de mudanças contra `anterior` quando houver, linha em branco, `textoWhatsApp`):
  - abertura: `A lista de quarta, ${dia} está aberta.` (sem cabeçalho de mudanças)
  - primeira: `Lista de quarta, ${dia}:` (sem cabeçalho)
  - rodada: só o cabeçalho
  - lembrete: `Faltam 2 horas para os mensalistas confirmarem. Ainda não confirmaram: ${juntarNomes(pendentesM)}.`
  - prazo: `Prazo dos mensalistas encerrado.` + (`Perderam a vaga: ${…}.` e `Subiram da fila: ${…}.` quando houver; se ninguém perdeu: `Todos os mensalistas confirmaram.`) e demais linhas do cabeçalho
  - cancelada: `A pelada de quarta, ${dia} foi cancelada.` (sem lista)
  - voltou: `A pelada de quarta, ${dia} voltou.`

- [ ] **Step 1: testes de agenda** (datas da semana de 11/11/2026 como em `tests/server/presencas.test.ts`):
  - `segunda 13:59 → null`; `segunda 14:00 sem abertura enviada → 'abertura'`; `segunda 16:10 sem abertura → 'abertura'`; `terça 09:00 sem abertura e sem último → 'primeira'`.
  - `segunda 23:30 com mudança → null`; `terça 08:00 com mudança desde 22:30 → 'rodada'`.
  - `mesma rodada já enviada → null` (reinício às 14:37 depois de enviar às 14:30).
  - `sem mudança → null`.
  - `quarta 12:00 com mensalista pendente → 'lembrete'`; `quarta 12:00 todos confirmados e sem mudança → null`; `quarta 12:40 (perdeu as 12:00) → não 'lembrete'`.
  - `quarta 14:00 → 'prazo'`; `quarta 20:30 → null`.
  - `cancelada → 'cancelada'` e depois `null`; `reaberta → 'voltou'`.
  - `virada de semana`: último envio da quarta 04/11 e agora segunda 09/11 14:00 → `'abertura'`, e a mensagem não tem linhas de mudança.
- [ ] **Step 2: testes de mensagem:** cada tipo começa com o texto verbatim acima e termina com `textoWhatsApp(...)`; `rodada` com `Confirmaram: Ana.` na primeira linha; `prazo` sem ninguém perder contém `Todos os mensalistas confirmaram.`; `cancelada` não contém a lista.
- [ ] **Step 3:** rodar → FAIL. **Step 4:** implementar. **Step 5:** rodar → PASS. **Step 6:** commit `feat: agenda e mensagens do robô do WhatsApp`.

### Task 3: Execução, WhatsApp e instalação no Mac

**Files:**
- Create: `src/robo/estado.ts` (ler/gravar `estado.json` de forma atômica), `src/robo/whatsapp.ts` (Baileys: conectar com `auth/` multi-arquivo, QR no terminal, achar grupo por nome, `enviar(texto)`), `src/robo/principal.ts` (laço), `src/robo/instalar.ts` (gera o LaunchAgent), `tests/robo/estado.test.ts`
- Modify: `package.json` (dependência `baileys` fixada + scripts), `docs/operacao.md` (seção "Robô do WhatsApp")

**Interfaces:**
- Consumes: Tasks 1–2; `estadoDaSemana(getDb(), now)`.
- Produces scripts:
  - `pnpm robo:configurar` — mostra o QR, conecta, lista os grupos chamados "Pelada 3.0" (um → grava o id no `estado.json`; vários → mostra e pede para escolher; nenhum → explica que o número precisa estar no grupo).
  - `pnpm robo` — laço de 1 em 1 minuto: lê a lista, `fotografar`, `decidir`, `montarMensagem`, envia, e **só depois do envio confirmado** grava `ultimo`/`aberturaEnviada`. Erro de banco ou de envio: registra no log e tenta na próxima volta (nada é gravado). Sessão deslogada: registra "Leia o QR de novo com `pnpm robo:configurar`" e para.
  - `pnpm robo:ensaio` — igual a `pnpm robo`, mas só imprime a mensagem que mandaria (com o tipo e a hora), sem conectar ao WhatsApp e sem gravar estado. Aceita `--agora=2026-11-11T12:00:00-03:00` para simular um horário.
  - `pnpm robo:instalar` / `pnpm robo:desinstalar` — LaunchAgent `com.pelada.robo` (RunAtLoad, KeepAlive, logs em `~/Library/Logs/PeladaRobo/`), rodando `pnpm robo` na pasta do projeto.
- Mac acordado: dentro da janela (segunda 14:00 → quarta 20:30) o laço mantém um `caffeinate -i -w <pid do robô>`; fora dela, encerra o `caffeinate` e dorme o laço até a janela seguinte.
- `.env` lido de `~/Library/Application Support/PeladaRobo/.env` (só `DATABASE_URL`); o robô recusa iniciar sem ele, com mensagem clara.

- [ ] **Step 1: testes de estado:** `gravar` + `ler` devolve o mesmo objeto; arquivo inexistente → `{ ultimo: null, aberturaEnviada: null, grupoId: null }`; JSON corrompido → erro claro (não zera em silêncio); gravação atômica (escreve em temporário e renomeia).
- [ ] **Step 2:** rodar → FAIL; implementar `estado.ts`; rodar → PASS; commit.
- [ ] **Step 3:** `whatsapp.ts`, `principal.ts` (com `--ensaio` e `--agora`), `instalar.ts`, scripts no `package.json`. Commit.
- [ ] **Step 4: ensaio contra um banco local** (PGlite de demonstração: `npx tsx .pglite-demo-seed/semear-demo.ts`, `DATABASE_URL=pglite:./.pglite-demo`): `pnpm robo:ensaio --agora=…` para segunda 14:00, terça 10:00 (depois de confirmar alguém no banco de demonstração), quarta 12:00 e quarta 14:00; colar as quatro saídas no relatório e conferir com os textos do desenho.
- [ ] **Step 5:** `docs/operacao.md` — seção "Robô do WhatsApp": criar o `.env` no Mac, `pnpm robo:configurar` (QR), testar primeiro num grupo de teste (configurar escolhendo outro grupo), instalar, Mac aberto e na tomada nos dias da pelada, como ver o log, como desligar. Commit.
- [ ] **Step 6:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (confirmar que nada de `src/robo` entra no build do site). O teste com o WhatsApp de verdade fica para o usuário (QR com o celular dele), guiado pelo controlador depois do merge.
