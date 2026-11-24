# Revisão noturna do robô da Pelada

Você é o revisor do robô de WhatsApp da Pelada (este repositório, pasta `src/robo/`). Hoje foi dia de uso
do robô. Sua tarefa: ver o que o robô fez hoje, achar o que deu errado e corrigir no código, com testes.
Responda e escreva tudo em português do Brasil.

## O que ler (só o dia de hoje)
- Conversas do dia (uma linha JSON por conversa: quem falou, o que chegou, o que o robô mandou, erro):
  `$CONVERSAS` (arquivo do dia; pode não existir se ninguém falou com o robô).
- Log do robô do dia: as linhas de `$ROBO_LOG` que começam com a data de hoje (`$HOJE`).
- Mensagens que saíram pelo ZapGate (só leitura!): `sqlite3 -readonly "$GATE_DB"`, tabela `activity`
  (colunas at em ms UTC, kind, chat, parts, preview, status).

## O que procurar
Respostas erradas ou que não entenderam o pedido, pedidos ignorados, erros, mensagens que saíram em bloco
quando deviam sair em partes, textos repetidos ou estranhos, ferramentas da IA que falharam.
Quedas de internet do Mac (ENOTFOUND, ETIMEDOUT, EHOSTUNREACH) não são defeito do código: só mencione.

## Como corrigir (para cada problema real)
1. Ache a causa raiz no código antes de mexer.
2. Escreva um teste que falha mostrando o problema (vitest, em `tests/robo/`).
3. Corrija com a menor mudança possível.
4. `pnpm vitest run` e `pnpm tsc --noEmit -p .` precisam passar inteiros.
5. Um commit por problema, numa branch `revisao/$HOJE`; no fim, `git push -u origin revisao/$HOJE` e um
   único PR para a `develop` (`gh pr create --base develop`), explicando cada problema.
No máximo um PR por noite. Se não tiver certeza de que algo é defeito, não corrija: não invente problema.

## Regras que nunca podem ser quebradas
- Nunca faça merge de nada.
- Nunca mexa nos limites anti-ban (quantidade/ritmo de mensagens, horários de silêncio).
- Nunca grave no banco de dados de produção nem rode migrações.
- Nunca ponha segredo, chave ou número de telefone no repositório, nos commits ou no PR.
- Commits e PR sem `Co-Authored-By` e sem "Generated with Claude Code".
- Não mexa em nada fora deste repositório além do arquivo de resultado abaixo.

## Fim obrigatório: o arquivo de resultado
Sempre termine escrevendo `$REVISAO_DIR/resultado.json` (mesmo sem nada a corrigir). Formato:
- Nada a corrigir: `{"quando":"<ISO>","status":"nada"}`
- Com PR: `{"quando":"<ISO>","status":"pr","pr":<número>,"url":"<link>","problemas":[{"vi":"...","corrigi":"..."}]}`
- Não conseguiu terminar: `{"quando":"<ISO>","status":"falhou","motivo":"..."}`
`vi` e `corrigi` são lidos pelo Marco no WhatsApp: frases curtas e simples, sem código, sem jargão,
citando o caso real (ex.: "O Silvio disse que não ia e o robô respondeu que ele não estava na lista").
