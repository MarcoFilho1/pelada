# Robô do WhatsApp responde quando é marcado — desenho

Adendo ao desenho do robô (`2026-11-10-robo-whatsapp-design.md`). Pedido do usuário em 10/11/2026,
depois de testar o robô no grupo de teste: quando alguém marca o número do robô no grupo, ele responde.

## Por quê

O grupo quer ver a lista na hora, sem esperar a rodada de 30 min, e tirar dúvidas ("quem falta
confirmar?", "quem é o artilheiro?"). E os organizadores querem sortear os times pelo WhatsApp.

## O que ele responde (só quando o número do robô é marcado com @ no grupo "Pelada 3.0")

1. **Comandos fixos (sem IA, sem custo):** o texto depois da marcação, sem diferenciar maiúsculas e
   acentos:
   - `lista` → a lista atual (o mesmo texto do "Copiar lista"), com o cabeçalho das mudanças desde a
     última mensagem do robô, quando houver.
   - `falta confirmar` / `quem falta` → "Ainda não confirmaram: A, B e C." (mensalistas e quem subiu
     da fila, pendentes) ou "Todo mundo da lista já confirmou."
   - `fila` → a fila de espera numerada, ou "Ninguém na fila."
   - `ajuda` → a lista de comandos e um exemplo de pergunta livre.
   - Marcação sem texto → a lista (como `lista`).
2. **Pergunta livre (IA, pela OpenRouter com a chave do usuário):** qualquer outro texto. A IA
   responde em pt-BR, curto, **só com dados do site** que ela consulta por ferramentas só de leitura:
   lista e fila da semana, mensalistas do mês, ranking (geral/ano/mês), artilharia, partidas e times da
   noite. Se o dado não existe, ela diz que não sabe; não inventa.
3. **Sorteio (só admins autorizados):** `sortear` (ou pedido equivalente à IA) por um número da lista
   de autorizados (o dono, Pepe e Jonas):
   - sorteia como o site (mesma regra, COMPLETE incluído) com os confirmados da pelada do dia,
     **sem salvar**, e mostra os 4 times com as notas e a diferença no grupo, terminando com
     "Confirma? Responda *sim* em até 10 minutos.";
   - só **o mesmo admin** respondendo "sim" (marcando o robô ou respondendo à mensagem) marca como
     definitivo, igual ao botão do site (inclusive a regra de partida em andamento e de times
     arquivados); "sortear de novo" gera outra proposta; depois de 10 minutos a proposta expira;
   - qualquer outra pessoa que pedir recebe "Só os organizadores podem sortear pelo WhatsApp.".

## Regras de convivência

- **Ligado a semana toda** para responder (conectado sempre que o Mac está ligado). As mensagens
  automáticas continuam só de segunda 14:00 a quarta 20:30.
- **Silêncio das 23:00 às 08:00 também para respostas:** marcação nesse horário não é respondida
  (nem depois). Exceção nenhuma, nem para sorteio.
- **Freio:** no máximo uma resposta por minuto no grupo; marcações a mais nesse minuto são ignoradas.
  `lista` repetida sem mudança desde a última mensagem do robô responde "A lista não mudou desde as
  15:30." em vez de mandar tudo de novo.
- **Limite da IA:** no máximo **30 perguntas livres por dia** (comandos fixos não contam). Passou do
  limite: "Por hoje acabaram as perguntas livres. Os comandos continuam: lista, falta confirmar, fila."
- Só responde no grupo configurado; marcação em outro grupo ou mensagem privada é ignorada.
- Responder a uma marcação **não** conta como "última lista enviada" para o cabeçalho das rodadas,
  exceto quando a resposta é a lista completa (aí as rodadas seguintes comparam com ela, para não
  repetir mudanças já mostradas).

## Dados e segredos

- A **chave da OpenRouter** e os **números autorizados a sortear** ficam no `.env` do robô no Mac
  (`~/Library/Application Support/PeladaRobo/.env`), nunca no repositório:
  `OPENROUTER_API_KEY=…`, `ROBO_ADMINS=55DDDNUMERO1,55DDDNUMERO2,55DDDNUMERO3`.
- Sem chave: comandos fixos e sorteio funcionam; pergunta livre responde "As perguntas livres não
  estão ligadas.".
- A IA nunca grava nada; o único caminho que grava é o sorteio confirmado, que usa as mesmas funções
  do site.

## Abordagens

| Abordagem | Decisão |
|---|---|
| Comandos fixos + IA com ferramentas só de leitura + sorteio com confirmação do admin | **escolhida** (pedido do usuário) |
| Só comandos fixos | descartada: usuário quer perguntas livres |
| IA livre podendo agir (confirmar presença, mexer na lista) | descartada: risco; confirmar pelo WhatsApp fica para depois |

## Fora do escopo

- Confirmar presença pelo WhatsApp ("@robô vou").
- Responder mensagem privada.
- Escolha final do modelo de IA: fica para quando o usuário colar a chave (o mais barato que use
  ferramentas bem em pt-BR; o custo por pergunta e o limite diário aparecem no guia).

## Decisões do Claude (o usuário pode mudar)

- Proposta de sorteio expira em 10 minutos; só quem pediu pode confirmar.
- Uma resposta por minuto; 30 perguntas livres por dia.
- Silêncio 23:00–08:00 também para respostas.
- Marcação sem texto responde a lista.

## Fica para quem constrói

- Como detectar a marcação (menção ao número do robô na mensagem) e ler o texto, como estruturar as
  ferramentas da IA, como guardar o contador diário e a proposta de sorteio, testes com mensagens
  falsas (sem WhatsApp e sem chamar a IA de verdade).
