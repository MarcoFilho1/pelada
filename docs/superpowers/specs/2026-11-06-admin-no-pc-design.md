# Admin no PC — desenho

Adendo ao desenho principal (`2026-11-04-pelada-design.md`). Pedido do usuário em 05–06/11/2026
depois de usar o site publicado no computador: "até o PC está com a interface mobile". Proposta
aprovada na conversa ("pode seguir, quero o painel como resumo").

## Por quê

O site inteiro é uma coluna de 448px (`max-w-md`). No PC ela fica no meio da tela com dois terços
vazios; as abas do admin nem cabem (Mensalistas e Admins cortadas) e Pelada/Sorteio pedem muita
rolagem. Quem usa o PC é principalmente o admin (o dono), então o admin vem primeiro; as telas do
jogador ficam para depois.

## Objetivos

- A partir de **1024px de largura** (`lg`), a área admin usa a tela: menu lateral fixo e telas em
  colunas.
- **Abaixo de 1024px nada muda** (celular e tablet continuam exatamente como hoje).
- O mesmo mundo visual do DESIGN.md ("placar de várzea"): mesmas cores, letras, raios, pílulas.
  Sem cor nova, sem sombra em repouso, lima só para estado.

## Fora do escopo (anti-objetivos)

- Telas do jogador (lista, ranking, perfil) — vêm num pedido seguinte.
- Anotador ao vivo: continua a tela cheia do celular (uso na beira da quadra), também no PC.
- Nenhuma regra de negócio muda; nenhum dado novo é guardado.
- Nada de site separado para PC: é o mesmo site se ajustando à largura.

## O que muda (a partir de 1024px)

- **Moldura:** menu lateral fixo à esquerda (marca "Pelada" no alto, as 7 seções em lista
  vertical, "Sair" no pé) no lugar das abas do topo e da barra do topo. O conteúdo ocupa o resto,
  alinhado no alto (não centralizado na altura), com largura máxima confortável de leitura.
- **Painel = resumo da semana** (decisão do usuário). Vale em **todas as larguras** (decisão do
  Claude: no celular os atalhos já existem nas abas, então o resumo também serve lá). Um bloco por
  assunto, cada um levando à sua seção:
  - Lista da quarta: data, estado (abre segunda / aberta / fechada / cancelada), confirmados x/16,
    quantos na fila.
  - Sorteio: times definitivos ou não, para a pelada do dia; sem pelada do dia, diz quando aparece.
  - Partidas: quantas jogadas na pelada do dia e se há uma em andamento (atalho para o anotador).
  - Jogadores: quantos ativos e quantos ainda com o PIN 1234.
  - Mensalistas do mês da próxima quarta: x/16.
- **Mensalistas:** nomes em 3–4 colunas; mês, contador e Salvar no alto.
- **Admins:** as seções do formulário em duas colunas.
- **Pelada:** duas colunas — a lista dos 16 à esquerda (linhas abrem no lugar, como hoje); "Pôr
  alguém na lista", fila, quem perdeu o prazo e o estado da lista à direita.
- **Jogadores:** tabela (nome, nota, situação do PIN). A nota se ajusta na própria linha com − e +
  e salva sozinha (mesmo seletor e mesma regra de 500 ms). Clicar no nome abre o resto (nome, zerar
  PIN, desativar) logo abaixo da linha.
- **Sorteio:** "Quem joga" numa coluna estreita à esquerda; os 4 times lado a lado à direita. As
  ações (Sortear, Marcar como definitivo, Sortear de novo) ficam acima dos times, não presas no
  rodapé. Escolher um jogador ou um COMPLETE abre as opções num painel ao lado (no lugar da folha
  que sobe de baixo).
- **Partidas:** próxima partida (os 4 times numa linha e Iniciar) à esquerda; já jogadas à direita.
- **Corrigir partida:** os dois times lado a lado.

## Entrega

Em três PRs empilhados, cada um útil sozinho:
1. Moldura (menu lateral), Painel resumo, Mensalistas, Admins.
2. Pelada e Jogadores.
3. Sorteio, Partidas e Corrigir partida.

## Decisões do Claude (o usuário pode mudar)

- Corte em 1024px; entre 768 e 1023 fica como o celular.
- Painel resumo também no celular.
- No PC os alvos continuam com 48px no mínimo (mouse não precisa de 56px, mas manter evita duas
  medidas por componente).

## Fica para quem constrói

- Composição fina de cada tela, seguindo as skills impeccable (craft-floor) e taste-skill (app
  screens) e o DESIGN.md; o DESIGN.md ganha uma seção "No PC" com o que for decidido.
