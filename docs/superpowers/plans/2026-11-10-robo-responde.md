# Robô responde quando é marcado — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** quando alguém marca o número do robô no grupo configurado, ele responde comandos fixos, perguntas livres (IA pela OpenRouter, só leitura) e, para os organizadores, sorteia os times com confirmação.

**Architecture:** regras puras e testadas (interpretar o texto, montar respostas, freio, proposta de sorteio) + uma camada de IA com ferramentas só de leitura (chamada HTTP à OpenRouter, testada com `fetch` falso) + a fiação no robô existente (`src/robo/`): receber mensagens do grupo pela Baileys, detectar a marcação e despachar.

**Tech Stack:** o robô atual (Node 22, tsx, Baileys 7.0.0-rc14), funções do site (`estadoDaSemana`, ranking, times, `sortearComCompletes`, `salvarTimesDefinitivos`), Vitest. OpenRouter: API compatível com chat completions + tools, via `fetch` (sem SDK novo).

**Spec:** `docs/superpowers/specs/2026-11-10-robo-responde-design.md` (e o desenho do robô `2026-11-10-robo-whatsapp-design.md`)

## Global Constraints

- Só responde a **marcação do número do robô** em mensagem do **grupo configurado** (`estado.grupoId`); privado e outros grupos: ignora.
- Silêncio **23:00–08:00** (Recife) também para respostas: marcação nesse horário é ignorada (nem responde depois).
- Freio: no máximo **1 resposta por minuto** no grupo; **30 perguntas livres por dia** (comandos fixos não contam); textos do spec verbatim.
- `.env` do robô: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `ROBO_ADMINS` (números com DDI, separados por vírgula). Sem chave ou sem modelo: pergunta livre responde `As perguntas livres não estão ligadas.`. **Nunca** número de telefone, chave ou URL de banco em arquivo do repositório (testes usam números fictícios).
- A IA **não grava nada**: só ferramentas de leitura. O único caminho que grava é o sorteio confirmado pelo mesmo admin, usando as mesmas funções do botão "Marcar como definitivo" do site (com as mesmas recusas: partida em andamento etc.).
- Proposta de sorteio expira em **10 minutos**; só quem pediu confirma com "sim".
- Responder com a lista completa atualiza `estado.ultimo` (as rodadas seguintes comparam com ela); outras respostas não.
- O robô passa a ficar conectado a semana toda; as mensagens automáticas continuam só na janela segunda 14:00 → quarta 20:30; o `caffeinate` continua só na janela.
- Baileys 7 identifica participantes de grupo por **LID** (`…@lid`) além do telefone: a marcação pode vir com o LID do robô e o remetente com LID — usar os campos `…Alt`/`…Pn` da própria Baileys (ver `node_modules/baileys/lib/Types/Message.d.ts` e `Events.d.ts`) para obter o telefone do remetente e reconhecer o próprio robô por `sock.user.id` **e** `sock.user.lid`.
- Git: pt-BR, sem atribuição a IA. Nada de `pkill` amplo. Não conectar ao WhatsApp de verdade nos testes.
- Verificação: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` limpos (o e2e do site é rodado pelo controlador).

## Review Focus

1. Mensagem com a marcação no meio do texto ("tá na lista? @robô lista") e com o nome salvo do robô em vez do número → reconhece só quando o JID/LID do robô está nas menções. Teste na Task 1/4.
2. Duas pessoas marcando no mesmo minuto → uma resposta só. Teste na Task 1.
3. "sim" de outra pessoa (não quem pediu) ou depois de 10 min → não salva. Teste na Task 3.
4. A IA pedindo uma ferramenta inexistente, argumentos inválidos ou demorando/falhando (HTTP 429/500, timeout) → responde uma frase curta de erro, sem travar o robô e sem contar como resposta da lista. Teste na Task 2.
5. Robô fora da janela (sábado) recebendo "@robô lista" → responde (ligado a semana toda), respeitando o silêncio. Teste na Task 4.

---

### Task 1: Comandos, respostas fixas e freio (puro)

**Files:** Create `src/robo/comandos.ts`, `src/robo/freio.ts`; Test `tests/robo/comandos.test.ts`, `tests/robo/freio.test.ts`.

**Interfaces (produz):**
```ts
type Comando = { tipo: 'lista' | 'falta' | 'fila' | 'ajuda' | 'sortear' | 'sim' } | { tipo: 'pergunta'; texto: string };
function interpretar(textoSemMarcacao: string): Comando;   // normaliza caixa/acentos/espaços; vazio → 'lista'; "falta confirmar"/"quem falta" → 'falta'; "sortear"/"sorteia"/"sorteio" → 'sortear'; "sim" → 'sim'
function respostaFalta(estado: EstadoDaSemana): string;    // "Ainda não confirmaram: A, B e C." | "Todo mundo da lista já confirmou."
function respostaFila(estado: EstadoDaSemana): string;     // "Fila:\n1. X\n2. Y" | "Ninguém na fila."
const TEXTO_AJUDA: string;                                // lista dos comandos + exemplo de pergunta livre
function respostaListaSemMudanca(hora: string): string;   // "A lista não mudou desde as 15:30."
class Freio { constructor(agora: () => Date); podeResponder(): boolean; registrarResposta(): void; podePerguntar(): boolean; registrarPergunta(): void }  // 1/min; 30/dia (dia de Recife)
const LIMITE_PERGUNTAS = 30;
const TEXTO_LIMITE = 'Por hoje acabaram as perguntas livres. Os comandos continuam: lista, falta confirmar, fila.';
```
- [ ] Testes (TDD, RED→GREEN) para cada comando e variação (acentos, maiúsculas, espaços, texto extra depois do comando conta como pergunta), respostas verbatim, freio (2 no mesmo minuto → 1; virada do dia zera as perguntas). Commit.

### Task 2: IA com ferramentas só de leitura (OpenRouter)

**Files:** Create `src/robo/ia.ts`, `src/robo/ferramentas.ts`; Test `tests/robo/ia.test.ts`, `tests/robo/ferramentas.test.ts`.

**Interfaces (produz):**
```ts
type Ferramenta = { nome: string; descricao: string; parametros: object /* JSON Schema */; executar(args: unknown): Promise<unknown> };
function ferramentasDeLeitura(db: DB, agora: () => Date): Ferramenta[];  // lista_da_semana, mensalistas_do_mes, ranking({periodo}), artilharia({periodo}), partidas_da_noite, times_da_noite — todas só SELECT, usando as funções do site
function perguntar(pergunta: string, op: { chave: string; modelo: string; ferramentas: Ferramenta[]; fetch?: typeof fetch; prazoMs?: number }): Promise<string>;
```
- `perguntar`: POST `https://openrouter.ai/api/v1/chat/completions` (Authorization Bearer), sistema em pt-BR ("responda curto, só com o que as ferramentas mostram; se não souber, diga que não sabe"), até **3** voltas de ferramenta, prazo total 30 s; erro/timeout/ferramenta inexistente → `Não consegui responder agora.`. Nunca loga a chave.
- [ ] Testes com `fetch` falso: resposta direta; uma volta de ferramenta; ferramenta inexistente; 429/500; timeout; mais de 3 voltas para. Testes das ferramentas contra PGlite (`tests/helpers/db.ts`) provando que só leem (tabelas iguais depois). Commit.

### Task 3: Sorteio pelo WhatsApp com confirmação

**Files:** Create `src/robo/sorteio-zap.ts`; Test `tests/robo/sorteio-zap.test.ts`.

**Interfaces (produz):**
```ts
type Proposta = { adminTelefone: string; criadaEm: Date; peladaId: number; elencos: number[][]; completes: { time: number; nota: number }[]; texto: string };
function ehAdmin(telefone: string, admins: string[]): boolean;          // compara só dígitos; aceita com/sem 55 e com/sem o 9 extra
function proporSorteio(db: DB, now: Date, adminTelefone: string, rng?: () => number): Promise<Proposta | { erro: string }>;   // mesma regra do site (confirmados da pelada do dia, COMPLETE), sem salvar; erro: "Hoje não tem pelada para sortear." etc.
function confirmarSorteio(db: DB, now: Date, telefone: string, proposta: Proposta | null): Promise<{ ok: string } | { erro: string }>;  // mesmo admin, < 10 min, salva com as funções do site
const TEXTO_SO_ADMIN = 'Só os organizadores podem sortear pelo WhatsApp.';
```
- Texto da proposta: os 4 times (bolinha em texto: "Azul", "Laranja", "Verde", "Preto"), jogadores com nota, COMPLETE com nota, soma por time, "Diferença: x,x" e por fim `Confirma? Responda *sim* em até 10 minutos.`.
- [ ] Testes contra PGlite: propor não grava; confirmar pelo mesmo admin grava times iguais aos da proposta; outro telefone ou depois de 10 min não grava; partida em andamento → erro do site repassado. Commit.

### Task 4: Fiação no robô (receber mensagens e despachar)

**Files:** Modify `src/robo/whatsapp.ts` (evento de mensagens recebidas, menções, remetente com telefone), `src/robo/principal.ts` (ficar conectado a semana toda; despachar), Create `src/robo/responder.ts` (despacho puro: mensagem → resposta, com freio, silêncio, admins, proposta em memória), Test `tests/robo/responder.test.ts`; Modify `docs/operacao.md` (seção do robô: comandos, chave/modelo/admins no `.env`, custo e limite, como desligar as perguntas livres).

**Interfaces:**
```ts
type MensagemRecebida = { grupoId: string; remetenteTelefone: string | null; texto: string; mencionaORobo: boolean; quando: Date };
function responder(m: MensagemRecebida, ctx: { estadoGrupoId: string | null; freio: Freio; admins: string[]; ... }): Promise<{ texto: string; ehListaCompleta: boolean } | null>;
```
- [ ] Testes de `responder` com fakes (sem WhatsApp, sem IA): ignora outro grupo e sem menção; silêncio 23–08; freio; comandos; pergunta sem chave; sorteio só admin; "sim" confirma; lista sem mudança responde a frase curta; lista completa marca `ehListaCompleta`. Commit.
- [ ] Fiação real e guia; `pnpm lint/typecheck/test/build`. Commit. O teste ao vivo é guiado pelo controlador com o usuário (grupo de teste).
