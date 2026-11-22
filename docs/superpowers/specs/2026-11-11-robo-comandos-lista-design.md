# Robô: mexer na lista pelo WhatsApp e comandos de consulta — desenho

Adendo a `2026-11-10-robo-responde-design.md`. Pedido do usuário em 11/11/2026: só comandos prontos
(sem IA), e qualquer pessoa do grupo pode adicionar, confirmar e remover jogadores cadastrados pelo
nome — como a lista de texto do WhatsApp, mas com as regras do site.

## Comandos (marcando o robô no grupo configurado)

| Comando | O que faz |
|---|---|
| `adicionar <nome>` (aceita também `adicionar lista <nome>`) | Põe o jogador **cadastrado e ativo** na lista pelas regras do "Entrar na fila" do site: com vaga entra direto; lista cheia → fila de diarista; mensalista do mês que saiu volta com a marca M. |
| `confirmar <nome>` | Confirma quem já está na lista principal, pelas regras do "Vou" do site (prazo das 14h do mensalista, lista fechada/cancelada). |
| `remover <nome>` | Tira da lista ou da fila, pelas regras do "Não vou" do site. |
| `artilheiro` | Os 3 primeiros em gols no mês atual (sem partida no mês: geral). |
| `garçom` / `garcom` | Os 3 primeiros em assistências (mesma regra de período). |
| `ranking` | Os 5 primeiros em pontos (mesma regra de período). |
| `times` | Os times da pelada de hoje, se já foram definidos; senão "Os times de hoje ainda não foram sorteados." |
| (já existentes) `lista`, `falta confirmar`, `fila`, `ajuda`, `sortear`/`sortear de novo`, `sim` | sem mudança |

- **Qualquer pessoa** do grupo pode usar `adicionar`, `confirmar` e `remover` (decisão do usuário).
- **Nome:** casamento sem diferenciar maiúsculas e acentos. Para `adicionar`, entre os jogadores
  cadastrados e ativos; para `confirmar`/`remover`, entre quem está na lista e na fila. Igual a um nome
  inteiro → esse; senão, se um único nome começa com o texto → esse; mais de um → "Tem mais de um
  jogador com esse nome: A e B. Mande o nome inteiro."; nenhum → para `adicionar`: "<nome> não está
  cadastrado. Peça para um admin cadastrar no site."; para os outros: "<nome> não está na lista."
- **Transparência:** toda resposta que muda a lista termina com "(pedido por <nome do WhatsApp de quem
  mandou>)"; a próxima rodada automática mostra a mudança no cabeçalho como sempre.
- Respostas (verbatim): "<Nome> entrou na lista." / "<Nome> entrou na fila (<n>º)." / "<Nome> já está na
  lista." / "<Nome> já está na fila." / "<Nome> confirmado." / "<Nome> já estava confirmado." / "<Nome>
  saiu da lista." / "<Nome> saiu da fila."; recusas usam a mensagem do site traduzida para o WhatsApp
  (sem "Recarregue a página.").
- **Comando desconhecido** (antes ia para a IA): sem chave da OpenRouter, responde com a lista de
  comandos (`TEXTO_AJUDA`, atualizado com os comandos novos). Com chave, continua indo para a IA.
- Freio (1 por minuto), silêncio 23–08 e "só no grupo configurado" valem igual.

## Decisões do Claude (o usuário pode mudar)

- `adicionar` usa as regras do jogador ("Entrar na fila"), não as do admin (que aceita lista fechada):
  pelo WhatsApp ninguém tem poder de admin.
- `confirmar` só confirma quem está na lista principal (quem está na fila só confirma quando subir).
- Ranking/artilheiro/garçom: mês atual se houve partida encerrada no mês, senão geral (mesma regra
  padrão da tela de Ranking).
- `remover` não pede confirmação (o grupo vê "pedido por").

## Fora do escopo

- Telefone de cada jogador / "@robô vou" por número.
- Cadastrar jogador novo pelo WhatsApp (continua com o admin no site).
