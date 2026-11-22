# Telas do jogador no PC — desenho

Adendo ao `2026-11-06-admin-no-pc-design.md`. Pedido do usuário em 10/11/2026: "mude a interface para o
desktop para os outros participantes também; só o painel do admin está responsivo". Proposta do jogador
já combinada em 06/11 (menu no topo, bloco ao lado da lista, ranking inteiro).

## Objetivos

- A partir de **1024px** (`lg`), as telas do jogador usam a largura do PC. **Abaixo de 1024px nada muda.**
- Mesmo mundo visual do DESIGN.md: sem cor, fonte, raio ou sombra nova; lima só para estado.

## O que muda (a partir de 1024px)

- **Navegação:** a barra fixa de baixo (Lista · Ranking · Perfil) vira links no **topo**, à direita da marca
  "Pelada", na mesma barra do topo; a barra de baixo e o espaço reservado para ela somem no PC.
- **Lista:** duas colunas — à esquerda, fixo no alto, o bloco "sua vaga" (Você vai? / Vou / Não vou) e o
  "Copiar lista pro WhatsApp"; à direita, a Lista (16) e a Fila.
- **Ranking:** a tabela inteira sem rolagem lateral (todas as colunas cabem); os destaques (Artilheiro,
  Garçom, Mais vitórias) numa coluna ao lado ou acima, sem esticar; filtro de período no alto. A frase
  "Arraste para o lado para ver mais colunas." some no PC.
- **Perfil:** os números (pontos e a grade 3×3) numa coluna e as "Quartas" (noites com as partidas) na outra.
- **Entrar, Trocar PIN (primeiro acesso e pelo perfil):** continuam uma coluna centrada (tela de uma tarefa).

## Fora do escopo

- Telas do admin (já feitas), anotador, regras de negócio.

## Decisões do Claude (o usuário pode mudar)

- Corte em 1024px, como no admin; entre 768 e 1023 fica como o celular.
- "Sair deste aparelho" continua no Perfil (não vai para o topo).
