# COMPLETE e "Sortear de novo" a qualquer hora — desenho

Adendo ao desenho principal (`2026-11-04-pelada-design.md`). Pedido do usuário depois de navegar na
demo, em 05/11/2026; aprovado por ele na conversa.

## Por quê

1. Depois de marcar o sorteio como definitivo e jogar a primeira partida, o admin não conseguia
   sortear de novo. Na pelada isso acontece: gente vai embora, chega atrasado, os times ficam
   desequilibrados no meio da noite.
2. Quando a lista não fecha 16, a pelada usa um "COMPLETE": uma vaga no time, com uma nota de
   referência (normalmente entre 2,5 e 3,5), que alguém presente preenche.

## O que muda

### 1. "Sortear de novo" sempre disponível

- O botão aparece mesmo depois de partidas jogadas.
- Com partidas já jogadas, antes de valer o site pede confirmação na própria tela (não em janela do
  navegador): "As N partidas já jogadas ficam como estão. Os times novos valem daqui pra frente."
- As partidas jogadas continuam com os times da época: placar, gols, ranking e histórico não mudam.
  Os times antigos ficam guardados (arquivados), não são apagados.
- A ordem de quem joga (fila de times) recomeça com os times novos: só contam as partidas entre os
  times atuais.
- Com uma partida em andamento, não dá para marcar o novo sorteio como definitivo: primeiro encerra.

### 2. COMPLETE

- **No sorteio:** com menos de 4 por time (menos de 16 com 4 times), o sorteio completa cada time
  com COMPLETE até fechar 4. A nota de cada COMPLETE é escolhida sozinha entre **2,5, 3,0 e 3,5**: a
  combinação que deixa os times mais equilibrados (no empate, a mais perto de 3,0). Todo time tem
  pelo menos um jogador de verdade.
- **O admin pode:** mudar a nota de um COMPLETE (0 a 5, passo 0,5), tirar um COMPLETE (o time joga
  com 3 de propósito) e pôr um COMPLETE num time (ex.: alguém foi embora). Antes e depois do
  definitivo.
- **Fixo no time:** o admin toca no COMPLETE e escolhe uma pessoa que não está em nenhum time atual
  (cadastrada, ou pelo cadastro rápido). Ela vira jogador daquele time pelo resto da noite e o
  COMPLETE some.
- **Só numa partida:** ao iniciar uma partida em que um dos times tem COMPLETE, o site pede, para
  cada COMPLETE, "Quem completa o Azul?". Aparecem primeiro os jogadores dos times atuais que não
  estão nessa partida, depois os jogadores ativos sem time (com busca). Também existe "Jogar sem"
  (o time joga com um a menos naquela partida). Na partida seguinte, a vaga volta a ser COMPLETE.
- **Anotador:** quem completa aparece como os outros, com GOL e AST, e uma marca "completando".
- **Ranking e histórico:** conta normal para quem completou (vitória/empate/derrota, gols,
  assistências), porque entra na foto do elenco da partida.

## Decisões do Claude (o usuário pode mudar)

- "Jogar sem" existe para quando ninguém pode completar.
- Quem completa uma partida não pode estar em nenhum dos dois times que jogam.
- A nota do COMPLETE só serve para o equilíbrio do sorteio; não aparece no ranking.

## Fica para quem constrói

- Como desenhar o COMPLETE no cartão do time, a folha de escolha e a confirmação (skills impeccable
  e taste-skill, seguindo o DESIGN.md "placar de várzea").
