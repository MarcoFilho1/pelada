---
name: Pelada
description: Lista, times e ranking da pelada de quarta — no celular, à noite, na quadra.
colors:
  chao: "#000000"
  placa: "#111111"
  placa-alta: "#2a2a2a"
  tinta: "#ffffff"
  apagado: "#b4b4b4"
  meta: "#949494"
  lima: "#c6f24e"
  erro: "#ff6166"
  erro-fundo: "#2c1a1c"
  colete-azul: "#4d8dff"
  colete-laranja: "#ff9a3d"
  colete-verde: "#2fbf6a"
typography:
  titulo:
    fontFamily: "Barlow Condensed, Inter, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  subtitulo:
    fontFamily: "Barlow Condensed, Inter, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.1
  numero:
    fontFamily: "Barlow Condensed, Inter, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: 1
  placar:
    fontFamily: "Barlow Condensed, Inter, system-ui, sans-serif"
    fontSize: "4.5rem"
    fontWeight: 600
    lineHeight: 1
  placar-baixo:
    fontFamily: "Barlow Condensed, Inter, system-ui, sans-serif"
    fontSize: "3.5rem"
    fontWeight: 600
    lineHeight: 1
  marca:
    fontFamily: "Barlow Condensed, Inter, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
  linha:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.4
  corpo:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  placa: "10px"
  cartao: "20px"
  pilula: "9999px"
spacing:
  margem: "20px"
  toque: "56px"
  toque-minimo: "48px"
components:
  botao-primario:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.chao}"
    typography: "{typography.linha}"
    rounded: "{rounded.pilula}"
    height: "56px"
  botao-primario-hover:
    backgroundColor: "{colors.apagado}"
  botao-primario-desabilitado:
    backgroundColor: "{colors.placa-alta}"
    textColor: "{colors.apagado}"
  botao-secundario:
    backgroundColor: "{colors.placa-alta}"
    textColor: "{colors.tinta}"
    typography: "{typography.linha}"
    rounded: "{rounded.pilula}"
    height: "56px"
  campo:
    backgroundColor: "{colors.placa}"
    textColor: "{colors.tinta}"
    typography: "{typography.linha}"
    rounded: "{rounded.placa}"
    height: "56px"
  linha-tocavel:
    textColor: "{colors.tinta}"
    typography: "{typography.linha}"
    rounded: "{rounded.placa}"
    height: "56px"
  placa-pin:
    backgroundColor: "{colors.placa}"
    textColor: "{colors.tinta}"
    typography: "{typography.numero}"
    rounded: "{rounded.placa}"
    width: "64px"
    height: "76px"
  placa-pin-pendurada:
    backgroundColor: "{colors.placa-alta}"
  placa-pin-erro:
    backgroundColor: "{colors.erro-fundo}"
    textColor: "{colors.erro}"
  botao-gol:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.chao}"
    typography: "{typography.linha}"
    rounded: "{rounded.placa}"
    height: "56px–72px"
  botao-ast:
    backgroundColor: "{colors.placa-alta}"
    textColor: "{colors.tinta}"
    typography: "{typography.corpo}"
    rounded: "{rounded.placa}"
    height: "56px–72px"
---

# Design System: Pelada

## Overview

**Creative North Star: "O placar de várzea à noite"**

O placar de madeira ou de chapa da quadra de várzea: placas pretas penduradas à mão, números pintados de
branco, refletor aceso e céu preto. O site é usado no celular, muitas vezes na beira da quadra às 20h30, por
amigos que só querem dizer quem são e confirmar presença. O mundo empresta quatro coisas e só elas: o preto
puro do fundo, as placas um degrau de luz acima, a letra condensada de pintor de placa para títulos e
números, e um gesto-assinatura — **pendurar a placa**: cada número entra numa célula fixa com um passo de
dois quadros.

A densidade é baixa e a escala é grande: uma tarefa por tela, alvos de toque de 56px, texto a 16px ou mais.
Tudo que importa fica no terço de cima, porque o teclado do celular ocupa a metade de baixo. Controles são os
de sempre (campo, lista, botão); o mundo nunca vira fantasia de placar sobre a interface.

**Key Characteristics:**
- Fundo preto puro (#000); elevação só por luminosidade (#111, #2a2a2a), sem borda e sem sombra.
- Duas letras: Barlow Condensed 600 para títulos, marca e números; Inter para o resto.
- Lima só para estado; vermelho só para erro; nenhum dos dois em botão, aba ou navegação.
- Ação principal por inversão: pílula branca com texto preto.
- Uma tarefa por tela; o conteúdo começa no topo no celular e centraliza na altura em telas largas.

## Colors

Preto de refletor apagado, branco de tinta de placa, e duas cores de sinal usadas com avareza.

### Primary
- **Lima de colete** (#c6f24e): estado e confirmação — o PIN novo sendo salvo, a seleção de texto, o cursor.
  Nunca em botão, aba ou navegação.

### Neutral
- **Chão de quadra à noite** (#000000): fundo de todas as telas e da barra do topo.
- **Placa** (#111111): campos, placas de PIN vazias, linha tocável sob o dedo.
- **Placa alta** (#2a2a2a): placa pendurada (preenchida), pressionado, botão desabilitado.
- **Tinta de placa** (#ffffff): texto principal, números, a pílula primária, anel de foco.
- **Tinta gasta** (#b4b4b4): texto secundário, rótulos de campo, links do topo (10:1 no chão).
- **Giz** (#949494): dicas e meta (6,9:1 no chão, 4,6:1 na placa alta).

### Signal
- **Cartão vermelho** (#ff6166): mensagens de erro e marcas nas placas com erro (7:1 no chão).
- **Fundo de erro** (#2c1a1c): placa que recebeu PIN errado.

### Coletes (identidade dos times)
- **Azul** (#4d8dff), **Laranja** (#ff9a3d), **Verde** (#2fbf6a) e **Preto** (o próprio chão #000 com contorno
  #b4b4b4 de 2px, para aparecer no fundo preto). Só na bolinha de 16px que identifica o time; nunca em texto,
  botão, fundo ou borda. O verde do colete é mais fechado que o lima, para não ser lido como "confirmado".

### Named Rules
**A Regra do Sinal Raro.** Lima e vermelho só aparecem quando carregam significado: lima para algo pendurado
ou confirmado, vermelho para erro. Uma tela em repouso é preto, branco e cinza.

**A Regra da Inversão.** A ação primária é a pílula branca com texto preto. A cor de destaque nunca preenche
um botão.

## Typography

**Display Font:** Barlow Condensed 600 (com Inter, system-ui)
**Body Font:** Inter (com system-ui)

**Character:** a condensada lembra letra de placa pintada e números de placar; a Inter faz o trabalho de
leitura sem chamar atenção. Duas letras, nunca três.

### Hierarchy
- **Título** (Barlow Condensed 600, 32px, 1.05, -0.01em): o h1 de cada tela, uma frase curta ("Quem é você?").
- **Subtítulo** (Barlow Condensed 600, 28px, 1.1): o h2 do bloco "sua vaga" ("Você vai?") e a contagem
  "x/16" ao lado do h2 das listas.
- **Número** (Barlow Condensed 600, 44px, 1): o dígito pintado na placa do PIN, a contagem e o cronômetro do anotador.
- **Placar** (Barlow Condensed 600, 72px, 1, tabular): só os gols do placar do anotador. O maior número do site.
  Em tela baixa (altura visível ≤ 760px) cai para 56px (**placar-baixo**).
- **Marca** (Barlow Condensed 600, 24px): "Pelada" no topo.
- **Linha** (Inter 500, 18px, 1.4): itens tocáveis (nomes sugeridos), texto de campo, rótulo do botão.
- **Corpo** (Inter 400–500, 16px, 1.5): descrições, rótulos, mensagens. Nada abaixo de 16px em campo (evita o
  zoom do iPhone) e nada abaixo de 14px em texto.

### Named Rules
**A Regra da Placa.** Barlow Condensed só em títulos, na marca e em números. Frases corridas, rótulos e
botões são Inter. Caixa normal, sem letras espaçadas em maiúsculas.

## Layout

Coluna única de até 448px (`max-w-md`), margens laterais de 20px, barra do topo de 56px no mesmo fundo (a área
admin muda a partir de 1024px: ver "No PC"). No
celular o conteúdo começa logo abaixo do topo (título 24px abaixo da barra) para caber acima do teclado; a
partir de 768px a área principal centraliza na altura. Ritmo: 8px entre rótulo e campo, 24px entre blocos,
32px antes das placas. Alvos de toque: 56px nos controles principais, 48px no mínimo (links de texto do topo
e ações secundárias, que estendem a área tocável com margem negativa sem mudar o alinhamento).

## Elevation & Depth

Sem sombras. A profundidade é só luminosidade: chão #000, placa #111, placa alta #2a2a2a. O foco é um anel
branco de 2px (contorno com 3px de afastamento nos controles; anel interno na placa atual do PIN).

### Named Rules
**A Regra do Chão Plano.** Nada em repouso tem sombra, borda ou brilho. Se algo precisar flutuar (menu,
folha), aí sim ganha sombra — e só ele.

## Shapes

Dois raios: 10px para placas e campos (a chapa do placar), pílula para a ação primária. Linhas tocáveis usam
10px só no realce de toque. Sem bordas de 1px como separador: espaço e degrau de luz separam.

## Components

### Buttons
- **Shape:** pílula (9999px), 56px de altura, largura total no celular.
- **Primary:** fundo branco #fff, texto preto, Inter 600 18px.
- **Hover / Active / Disabled:** hover #b4b4b4, ativo #949494, desabilitado placa alta #2a2a2a com texto
  #b4b4b4 e rótulo no gerúndio ("Entrando…").
- **Secondary:** a mesma pílula de 56px em placa alta #2a2a2a com texto branco (hover #949494 a 40%, ativo a
  60%). Para a segunda ação grande de um bloco ("Não vou", "Sair da fila", "Tirar da lista", "Copiar lista
  pro WhatsApp"), quando um link de texto seria pequeno demais para o dedo. Nunca duas pílulas brancas no
  mesmo bloco.
- **Tertiary:** link de texto Inter 500 16px em #b4b4b4 que vai para branco no hover ("Não sou eu", "Começar de
  novo", "Admin").

### Inputs / Fields
- **Style:** fundo placa #111, sem borda, raio 10px, 56px, texto 18px branco, rótulo acima em Inter 500 16px
  #b4b4b4, placeholder em #949494.
- **Focus:** anel branco de 2px; cursor lima.
- **Error:** anel vermelho #ff6166 de 2px e mensagem abaixo com `role="alert"`.

### Lista tocável (sugestões de nome)
- Linhas de 56px, nome em Inter 500 18px branco, seta desenhada de 20px em #949494 à direita; realce #111 no
  hover e #2a2a2a ao tocar. A área tocável vai até as margens da coluna.

### Navigation
- Barra de 56px no fundo: marca à esquerda, no máximo um link de texto à direita. Sem ícones em caixa, sem
  pílulas coloridas.

### Navegação do admin
- Linha de texto logo abaixo da barra (Painel · Pelada · Sorteio · Partidas · Jogadores · Mensalistas · Admins), Inter 500 16px, itens de
  48px de altura com 10px de folga lateral. Seção atual: texto branco sobre placa #111 (raio 10px) e
  `aria-current="page"`; as outras em #b4b4b4, branco no hover. Sem lima, sem sublinhado. Se não couber,
  rola de lado, sem quebrar linha. Só existe dentro da área admin; /admin/entrar e o anotador não têm.
  A partir de 1024px vira o menu lateral (ver "No PC").

### Painel (resumo da semana, admin)
- Vale em todas as larguras. h1 "Painel" e, em #b4b4b4, "Hoje é sexta, 06/11.". Abaixo, um bloco por assunto
  (lista, sorteio, partidas, jogadores, mensalistas), 8px entre eles: placa #111, raio 10px, 20px de respiro, e a
  placa inteira é um link para a seção (hover placa alta a 60%, ativo placa alta). Dentro: o nome do assunto em
  Inter 500 18px com a seta de 20px em Giz à direita, o número em Barlow tabular com a palavra em Inter 16px
  #b4b4b4 ao lado ("10/16 confirmados", "22 ativos") e uma frase em #b4b4b4 com o estado ("Aberta, 2 na fila.",
  "Abre segunda, 09/11, à meia-noite.", "1 ainda está com o PIN 1234."). O número da lista é o maior (Número,
  44px); os outros em Subtítulo (28px). Sem ícone, sem cor: só o check lima de 20px em "Times definitivos".
- Sem pelada até hoje, sorteio e partidas dizem quando aparecem, sem número. Fora do dia, os dois falam da última
  pelada com a data ("Na última pelada, 04/11, teve times definitivos. O próximo aparece no dia da pelada."; o
  sorteio fica sem número e sem o check lima, para ninguém achar que os times da semana já saíram). Pelada do dia
  cancelada: "A pelada de hoje foi cancelada.". Com partida em andamento, o bloco das partidas leva direto ao
  anotador ("Uma em andamento: voltar ao anotador.").
- O resumo só lê o banco: abrir o painel nunca cria a pelada da semana nem copia os mensalistas.

### Linha de jogador recolhível (admin)
- Placa #111, raio 10px, em lista com 8px de intervalo. Fechada: 56px, nome em Inter 500 18px (truncado), meta
  em Giz 16px abaixo ("Inativo", "PIN ainda é 1234"), nota em Barlow 28px à direita e seta que gira 90° ao
  abrir. Só uma linha aberta por vez; a aberta mostra o seletor de nota e as ações. A partir de 1024px vira a
  tabela de Jogadores (ver "No PC").

### Seletor de nota (stepper)
- Menos, valor, mais: botões 56×56 em placa alta #2a2a2a (raio 10px), valor em Barlow 44px sobre #000, 96px de
  largura. Passos de 0,5 de 0 a 5; o botão do limite fica desabilitado em Giz. Nada de campo de texto. Salva
  sozinho 500 ms depois do último toque (e na hora ao sair da tela); o valor local vale até o servidor devolver
  o mesmo número.

### Nome editável (admin)
- Na linha aberta, depois do seletor de nota: rótulo "Nome" em #b4b4b4, campo em #000 (raio 10px, 56px, 18px,
  anel branco no foco). O botão "Salvar nome" (pílula branca) só aparece quando o texto mudou; Enter também
  salva. Nome repetido: anel vermelho e mensagem com `role="alert"` logo abaixo do campo, sem aviso global.

### Painel de colar nomes
- Placa #111 com título, instrução em #b4b4b4, área de texto em #000 (raio 10px, 18px, anel branco no foco) e,
  abaixo, a prévia: "Vão entrar N" numa placa alta com um nome por linha e, em Giz, "Ficam de fora (M)" com os
  nomes ignorados. O botão primário diz a conta ("Criar 5 jogadores") e fica desabilitado em zero.

### Confirmação em linha
- Ação destrutiva (zerar PIN, desativar) abre, no lugar das ações, uma placa alta com a frase da consequência,
  pílula branca com o verbo ("Zerar PIN") e link "Cancelar". Sem modal. O resultado aparece como mensagem de
  status em lima (`role="status"`) ou vermelho em erro, acima da lista.

### Linha de marcar (mensalistas)
- Botão-linha (`role="checkbox"`) de 56px em placa #111, raio 10px, nome em Inter 500 18px à esquerda e, à direita,
  uma casinha de 32px: vazia = quadrado #000; marcada = traço de check em lima sobre #000 e a linha sobe para
  placa alta #2a2a2a. Lista com 8px de intervalo. Com 16 marcados as outras linhas ficam em Giz,
  `aria-disabled`, sem reagir ao toque.

### Contador e seletor de mês
- "x/16" em Barlow 44px tabular, com a instrução em #b4b4b4 ao lado ("Vagas cheias. Tire alguém para pôr outro.").
  Seletor de mês: seta 56×56 em placa alta, nome do mês por extenso no meio (Inter 500 18px). Com mudança não
  salva as setas apagam (placa #111, Giz) para não perder a marcação; a barra de baixo (fixa, fundo #000) traz
  "Desfazer" em texto e a pílula "Salvar mensalistas".

### Formulário em seções (admins)
- Seções de formulário separadas por 40–48px de espaço, cada uma com h2 em Barlow 24px. Campo com dica em Giz
  (16px) ligada por `aria-describedby`; o anel vermelho vai só no campo que errou; mensagem de status/erro entre a
  dica e a pílula.

### Bloco "sua vaga" (lista do jogador)
- A primeira coisa abaixo do título da quarta: placa #111, raio 10px, 20px de respiro. h2 em Subtítulo com a
  resposta ("Você vai?", "Você vai", "Abriu vaga pra você", "Você é o 2º da fila", "Você perdeu o prazo das
  14h", "Você não está na lista"), uma frase em #b4b4b4 com a regra que importa agora, e as ações em
  pílulas de largura total empilhadas (primária branca em cima, secundária em placa alta embaixo).
- Confirmado: traço de check lima de 28px ao lado do h2. Lima só aí e nas linhas confirmadas.
- Sair (Não vou, Sair da fila) pergunta antes, no lugar dos botões: placa alta com a consequência ("Você
  perde a vaga. Se voltar, entra no fim da fila."), pílula branca com o verbo e "Voltar" em texto.
- Lista travada (antes de segunda 00:00, fechada pelo admin, cancelada, jogo começou): o mesmo bloco com o
  porquê e, em branco, onde a pessoa está ("Você está confirmado na vaga 3."). Sem Vou nem Entrar na fila;
  com a lista fechada ou ainda não aberta, quem está na lista ou na fila ainda vê "Não vou" / "Sair da fila".
  Cancelada e jogo começado: sem botão nenhum.
- Erro da ação: frase em vermelho com `role="alert"` logo abaixo dos botões.

### Linhas da lista (jogador)
- Lista numerada (`<ol>`) de 44px por linha, sem placa (não são tocáveis): número em Barlow 20px Giz à
  direita de uma coluna de 24px, nome em Inter 500 18px, "M"/"D" em Giz 16px e, à direita, o estado:
  confirmado = check lima de 24px; pendente = ampulheta desenhada de 20px em Giz. Os dois têm texto para
  leitor de tela. O ✅/⏳ de verdade só existe no texto copiado pro WhatsApp, nunca na tela.
- A linha da própria pessoa ganha placa alta #2a2a2a e " · você" em #b4b4b4.
- Vaga vazia: número e "Vaga aberta" em Giz. Fila vazia: "Ninguém na fila." em Giz.
- Cabeçalho de cada lista: h2 em Barlow 24px à esquerda e, na principal, "x/16" em Subtítulo + "confirmados".

### Copiar lista
- Pílula secundária de largura total com o ícone de copiar (20px) no fim da tela. Copiou: "Copiado. Agora é
  colar no grupo." em lima, centralizado, com `role="status"`, por 2,5 s. Sem área de transferência: abre
  uma área de texto (#111, 16px) com o texto já selecionado e a instrução acima.

### Escolha de estado (admin, rádio 2×2)
- Quatro botões-linha `role="radio"` em grade de 2 colunas (8px de intervalo), 56px, placa #111, rótulo em
  Inter 500 18px; o escolhido sobe para placa alta e mostra o check lima à direita (como a Linha de marcar).
  Abaixo, em #b4b4b4, o que o estado escolhido faz.

### Linha da pelada (admin)
- Como a Linha de jogador recolhível: placa #111, 56px, número, nome, M/D, estado (check lima ou ampulheta) e
  seta que gira. Aberta: placa alta com as ações em pílulas ("Confirmar presença" branca; "Tirar da lista"
  secundária, que pede confirmação em linha; "Pôr no fim da fila" para quem perdeu o prazo).

### Sorteio (admin)
- **Cabeçalho:** h1 com a quarta ("Quarta, 11/11") e, abaixo, "Hoje" ou "A última pelada" em #b4b4b4; depois de
  definir, " · Times definitivos" em branco com o check lima de 20px.
- **Quem joga:** a Linha de marcar dos mensalistas com a nota em Giz 16px tabular antes da casinha; desmarcada,
  o nome cai para #b4b4b4. Acima, a busca ("Pôr mais alguém") com a Lista tocável; sem nome igual, a última linha
  é "Cadastrar “Fulano”" com "Jogador novo, nota 3,0" em Giz. Contagem "N marcados" como o "x/16".
- **Diferença:** "Diferença: 0,5" em Subtítulo (Barlow 28px), à direita uma ação de texto opcional ("Mudar
  quem joga"); embaixo, em Giz, o gesto da tela ("Toque em dois de times diferentes para trocar."). Times de
  tamanhos diferentes ganham uma linha em #b4b4b4 com a diferença por jogador (2 casas).
- **Cartão de time:** grade 2×2 com 8px de intervalo, placa #111 raio 10px, 6px de respiro. Cabeçalho de 48px:
  bolinha do colete, nome da cor em Inter 600 16px, soma em Barlow 28px tabular à direita. Jogadores em linhas
  de 48px: nome Inter 500 16px (truncado), nota em Giz tabular. Time vazio: "Ninguém." em Giz.
- **COMPLETE (vaga no cartão):** time com menos de 4 ganha vagas "COMPLETE", linhas de 48px que são um buraco na
  placa: fundo #000 (`bg-chao`), rótulo "COMPLETE" em Inter 500 16px #b4b4b4 e a nota em Giz tabular (conta na
  soma e na diferença). Escolhida, vira placa alta com anel lima de 2px por dentro (`aria-pressed`). Abaixo, a
  linha "+ COMPLETE" (ícone de mais de 20px e rótulo em Giz, sem placa) acrescenta uma vaga com nota 3,0 enquanto o
  time tiver menos de 4 entre jogadores e COMPLETE; a nota automática do sorteio é só 2,5, 3,0 ou 3,5.
- **Folha do COMPLETE:** a mesma folha do jogador escolhido (placa #111, raio 20px em cima, sombra para cima):
  "COMPLETE do Azul" em Inter 500 18px com a soma e a diferença ao vivo em #b4b4b4 (a folha cobre os cartões no
  celular) e "Fechar" em texto; o seletor de nota (o mesmo dos jogadores, 0 a 5, passo 0,5, salva sozinho depois
  de 500 ms); "Pôr alguém no lugar" (pílula branca, só nos times definitivos) e "Tirar o COMPLETE" (pílula
  secundária: o time joga com um a menos, avisado em lima na barra).
- **Quem entra no Azul?:** tela cheia no lugar da lista (h2 em Barlow 24px com "Cancelar" em texto à direita;
  "No lugar do COMPLETE (3,0). Fica no time pelo resto da noite." em #b4b4b4). Primeiro "Na lista, sem time",
  depois a busca com a Lista tocável (e "Cadastrar “Fulano”"); linhas de 56px com nome, nota em Giz e o mais.
  Escolher preenche a vaga e volta aos times.
- **Sortear de novo (times definitivos):** seção no pé da tela com a pílula secundária "Sortear de novo" e, em
  #b4b4b4, que os times salvos só mudam quando o novo sorteio for marcado como definitivo (e que as partidas já
  jogadas não mudam). Com partidas jogadas, "Marcar como definitivo" abre na própria barra uma placa alta com a
  frase do que muda ("Usar os times novos" em pílula branca, "Voltar" em texto); nada de `confirm`.
- **Jogador escolhido:** placa alta com anel lima de 2px por dentro (`aria-pressed`). Tocar de novo cancela;
  tocar outro do mesmo time troca a escolha. Os dois trocados entram com o passo de pendurar (90ms, 2 quadros).
- **Barra de baixo:** fixa no rodapé, fundo #000 (como a dos mensalistas): "Sortear 16 em 4 times" (pílula
  branca, conta o que vai fazer); na proposta, "Marcar como definitivo" em cima e "Sortear de novo" secundária.
- **Folha do escolhido:** com um jogador escolhido, a barra vira folha: placa #111, raio 20px só em cima,
  sombra para cima (ela flutua sobre os times; é a única sombra da tela). Na proposta: "Trocar Fulano" + "com
  alguém de outro time" e "Cancelar". Nos times definitivos: "Levar Fulano para" (ou "Pôr Fulano no"), os
  outros times como botões de 56px em placa alta com a bolinha, "Tirar do time" secundária e "Cancelar".
- **Partida rolando:** logo abaixo do cabeçalho, placa #111 com "Partida em andamento — mudanças valem para a
  próxima." em branco Inter 500 16px (`role="status"`, sem lima) e a ação de texto "Anotador" à direita.
- **Resultado:** "Fulano agora é do Azul." em lima com `role="status"` na barra; erro em vermelho com
  `role="alert"`.
- A partir de 1024px a barra e as folhas somem: ações acima dos times e Painel ao lado (ver "No PC").

### Noite das partidas (admin)
- **Cabeçalho:** h1 "Partidas" e, abaixo, "Quarta, 04/11 · Hoje" (ou "A última pelada") em #b4b4b4, como no Sorteio.
- **Ficou aberta:** partida de outra pelada que ninguém encerrou aparece no alto, numa placa #111: "Partida de 28/10
  ficou aberta" em Inter 500 16px branco, o confronto, "Ela só conta no ranking depois de encerrada." em #b4b4b4 e a
  pílula secundária "Abrir anotador" (lá se encerra).
- **Em andamento:** placa #111 com "Em andamento" em #b4b4b4, o confronto e a pílula branca "Voltar ao anotador".
  Enquanto uma partida roda não aparece Iniciar.
- **Próxima partida:** h2 em Barlow 24px, a regra da fila em Giz e os times em grade 2×2 na ordem da fila
  (botões `aria-pressed`, placa #111, raio 10px, ~96px): bolinha, nome em Inter 600 16px, posição na fila ("1º")
  em Giz 14px à direita e os nomes dos jogadores em #b4b4b4 14px (até 2 linhas). Os dois da sugestão começam
  escolhidos: placa alta com anel lima de 2px por dentro (como o Jogador escolhido). Com dois escolhidos, tocar um
  terceiro troca o último escolhido (quem fica continua). Fora da sugestão: "Escolha livre. Toque para trocar." e o
  link "Voltar para a sugerida". A pílula diz a conta: "Iniciar Azul × Laranja"; sem dois, "Escolha dois times"
  desabilitada.
- **Chip "N COMPLETE":** nos cartões da fila, quando o time tem vaga de COMPLETE, um chip abaixo dos nomes:
  "COMPLETE" (ou "2 COMPLETE"), Inter 500 14px #b4b4b4 sobre #000 (o buraco da placa, como no Sorteio), raio
  `placa` (10px), 24px de linha e 6px de respiro lateral. Sob a pílula, "Antes de começar, você escolhe quem
  completa o Azul." em Giz.
- **Quem completa o Azul?:** com COMPLETE entre os dois times, Iniciar não começa na hora: um passo por vaga, tela
  cheia no lugar da fila. h2 em Barlow 24px com a bolinha do colete e "Voltar" em texto à direita; abaixo, em
  #b4b4b4, quem já completa o mesmo lado ("Pepe já completa. Falta mais um." / "Faltam mais 2.") e "No lugar do
  COMPLETE (3,0), só nesta partida.". Primeiro "Dos outros times" (linhas de 56px com bolinha do time, nome,
  nota e o mais), depois a busca ("Alguém sem time" / "Buscar pelo nome") e "Jogar sem" em pílula secundária
  com a conta de quantos jogam. Quem já está no jogo aparece como "Já está no jogo".
- **Conferência:** depois da última vaga, h2 em Barlow 24px com o confronto ("Azul × Laranja") e "Voltar aos
  times" em texto; "Na próxima partida, a vaga volta a ser COMPLETE." em #b4b4b4. Uma placa #111 de 56px por vaga
  (raio 10px): bolinha, "Pepe completa o Azul" (nome em branco Inter 500) ou "Ninguém: o Azul joga com 3" e
  "Trocar" em texto, que volta àquele passo. Embaixo, a pílula branca "Iniciar Azul × Laranja" ("Iniciando…").
- **Sem como iniciar** (não é o dia, pelada cancelada, menos de 2 times): uma placa #111 com o porquê em #b4b4b4 e o
  link para onde resolver ("Pelada", "Sorteio") sublinhado em branco.
- **Já jogadas:** `<ol>` de placas #111 (raio 10px, 8px entre elas): número da partida em Barlow 20px Giz, o
  confronto "● Azul 3 × 1 Laranja ●" (nomes Inter 500 16px, placar Barlow 24px tabular) e, abaixo, "Azul venceu" ou
  "Empate" em #b4b4b4 14px; "Corrigir" como ação de texto à direita. Vazia: "Nenhuma partida encerrada ainda." em Giz.
- A partir de 1024px, duas colunas (ver "No PC").

### Anotador ao vivo ("Anotar A", admin)
A tela mais importante do site: o admin segura o celular na beira da quadra e toca sem olhar direito.
- **Tela inteira:** sem a barra do topo nem a navegação do admin; margens de 16px (a exceção aos 20px, para as
  colunas caberem). Topo e barra de baixo presos; só o meio rola. 4 contra 4 não rola nem na parte visível do
  navegador de um celular comum (360×640, 390×664) nem na tela inteira (390×844); 5 contra 5 rola pouco. Wake Lock
  enquanto a partida está aberta.
- **Tela baixa** (variante `baixa`: altura visível ≤ 760px): o cronômetro cai para 32px (Título), o placar para
  56px numa linha de 56px, os cartões apertam (4px de respiro, nome com 20px de linha, números com 16px, 6px entre
  cartões) e GOL/AST vão até 48px (o piso); Desfazer, Encerrar e a pílula da folha ficam com 48px. GOL continua
  branco e maior que AST. Com quem completa na partida, o limite sobe 20px por marca "completando" na coluna mais
  cheia (≤ 780px com uma, ≤ 800px com duas), para 4 contra 4 não rolar em altura nenhuma.
- **Quem completa:** o cartão ganha, abaixo do nome, a marca "completando" (Inter 14px #b4b4b4 sobre #000, o buraco
  na placa, como o COMPLETE do Sorteio), uma linha a mais que os botões de todos descontam. GOL e AST iguais.
- **Topo:** seta de voltar (48×48, "Voltar para partidas" para leitor de tela) à esquerda e o cronômetro regressivo
  em Número (44px, tabular, `m:ss`) no centro; abaixo, a barra do tempo de 6px (trilho placa alta, preenchimento
  branco, cresce com o tempo gasto). Depois o placar: bolinha e nome do time (Inter 600 16px, branco) por fora, os
  gols em Placar (72px) por dentro e um "×" em Barlow 28px Giz no meio. O lado A fica à esquerda, como a coluna dele.
- **Cartão do jogador:** duas colunas (8px), uma por time, na ordem do placar. Placa #111, raio 10px, 6px de respiro:
  nome em Inter 500 16px (truncado) e, abaixo, "2 gols · 1 ast" em Giz 14px com os números em Inter 600 (brancos
  quando passam de zero). Embaixo, lado a lado, os botões **GOL** (3/5, branco com texto preto, Inter 600 18px) e
  **AST** (2/5, placa alta, Inter 600 16px), raio 10px, altura de 56px a 72px conforme a altura da tela (48px a 72px
  em tela baixa). GOL e AST
  ficam em maiúsculas como no placar (a única exceção à caixa normal; sem espaçamento). Leitor de tela ouve "GOL de
  Pepe" e "AST (assistência) de Pepe".
- **Toque:** conta na hora (otimista), vibra 30ms e o número entra com o passo de pendurar; enquanto o servidor não
  confirma, os números do cartão ficam em lima (salvando, como os pontos do PIN) e voltam ao branco na resposta. Se o
  servidor recusar, o número volta e o erro aparece em vermelho na barra de baixo por 4 s.
- **Barra de baixo:** fundo #000. "Desfazer" (3/5, pílula placa alta de 56px em duas linhas: "Desfazer" em Inter 600
  16px e o que vai sair em #b4b4b4 14px — "gol de Pepe"; sem lance, "nada para desfazer" e desabilitado) e "Encerrar"
  (2/5, pílula secundária). Com Desfazer na fila: "Desfazendo…", e o botão continua tocável (cada toque enfileira
  mais um, sempre o último que a tela mostra). Toques e Desfazer vão ao servidor numa fila única, na ordem feita.
- **Pergunta de encerrar** (folha: placa #111, raio 20px só em cima, sombra para cima; o meio encolhe e continua
  rolando): no 3º gol, "Azul venceu 3×1 — encerrar?"; aos 0:00 (com vibração longa), "Acabou o tempo. Empate 1×1 —
  encerrar?", em Subtítulo. Abaixo, "Depois de encerrar, só dá para mudar em Corrigir." em #b4b4b4, a pílula branca
  "Encerrar partida", e na mesma linha o Desfazer e "Continuar jogando" em texto. Nunca encerra sozinha; continuar
  vale até o placar mudar. O botão Encerrar da barra abre a mesma folha como confirmação ("Encerrar com Azul 1×1
  Laranja?") com "Voltar". Sem `alert`/`confirm`.
- **Encerrada** (aqui ou por outro admin): o placar e o cronômetro ficam parados (no que faltava ao encerrar,
  sem vibrar); no lugar dos cartões, "Partida encerrada" em Subtítulo, o
  resultado em #b4b4b4 18px, "Ver partidas" (pílula branca) e "Corrigir" (secundária).

### Corrigir partida (admin)
- Link "‹ Partidas" de 48px, h1 "Corrigir partida", o confronto com o placar em Subtítulo e, em #b4b4b4,
  "Azul venceu. Cada toque já fica salvo." (`role="status"`). Um bloco por time (h2 Barlow 24px com a bolinha) com uma
  placa #111 por jogador: nome em Inter 500 18px e dois contadores lado a lado — menos e mais de 48×48 em placa alta,
  o valor em Subtítulo tabular com "gols"/"ast" em #b4b4b4 14px embaixo. O menos fica em Giz sobre placa no zero.
  Tudo trava enquanto um toque salva.

### Barra de baixo do jogador (Lista · Ranking · Perfil)
- Fixa no rodapé, fundo #000 (como as barras dos mensalistas e do sorteio), sem borda nem sombra, com o recuo da
  área segura do iPhone. Três itens de largura igual, 56px de altura, Inter 500 16px; o atual em branco sobre placa
  #111 (raio 10px) e `aria-current="page"`, os outros em #b4b4b4, branco no hover. Sem lima, sem ícone.
- Reserva a própria altura no fim da página: nada fica escondido atrás dela. A barra do topo perde o "Sair" (ele
  mora no Perfil). Telas de uma tarefa com teclado aberto (Trocar PIN) não têm a barra; têm "‹ Perfil".

### Filtro de período (ranking e perfil)
- Abas Geral · Ano · Mês num trilho placa #111 (raio 10px, 4px de respiro), itens de 48px; a escolhida sobe para placa
  alta com texto branco, as outras em #b4b4b4. Aba sem partida nenhuma fica em Giz, `aria-disabled`.
- Em Ano e Mês, logo abaixo, o seletor do Contador e seletor de mês: setas 56×56 em placa alta, o período por extenso
  no meio ("Novembro de 2026"); sem vizinho, a seta apaga (placa, Giz). Só anda pelos anos e meses que têm partida.
- O período vive na URL (`?p=geral`, `?p=2026`, `?p=2026-11`) para o link ir pro grupo; abas e setas são links.
  Sem `?p` (ou com um inválido) vale o mês atual se já teve partida encerrada, senão o geral.

### Ranking
- h1 "Ranking", o filtro, e os **destaques** numa placa #111 só: uma linha por destaque (Artilheiro, Garçom, Mais
  vitórias), nome em Inter 500 18px com o título em #b4b4b4 14px embaixo e, à direita, o número em Subtítulo
  tabular com a unidade em Giz 14px ("7 gols", "3 ast"). Destaque que ninguém fez não aparece.
- **Tabela** que vai até as bordas da tela (a margem de 20px vira respiro da primeira e da última coluna). Posição
  (Barlow 20px Giz), nome (Inter 500 16px, truncado) e **pontos** ficam presos à esquerda; os pontos em Barlow 24px
  branco numa coluna de placa #111 com os cantos de cima e de baixo arredondados — a placa do placar, a assinatura
  da tela. As outras colunas (J, V, E, D, %, G, A, G/J, Pres.) rolam de lado dentro da tabela, números à direita em
  Inter 16px #b4b4b4 tabular; a página nunca rola de lado. Linhas de 48px, sem divisória nem zebra.
- Cabeçalho: botões de 48px em Giz 14px; tocar ordena por aquela coluna (números do maior para o menor, nome de A a
  Z), tocar de novo inverte, "#" volta à ordem do ranking. A coluna ativa fica em branco 600 com a setinha do
  sentido (`aria-sort`). A posição de cada um não muda com a ordem.
- A linha da própria pessoa ganha placa alta #2a2a2a de ponta a ponta (como na lista), com "(você)" para leitor de
  tela. Acima da tabela, em Giz 14px, "Arraste para o lado para ver mais colunas."; abaixo, a legenda das siglas.
  A última coluna é a **Nota** (notas são públicas), com uma casa ("3,5"); tocar ordena da maior para a menor.
- Sem ninguém no período: placa #111 com "Nenhuma partida encerrada ainda." e de onde o ranking sai.

### Perfil (só o dono vê)
- h1 com o nome e, na mesma linha à direita, "nota" em #b4b4b4 com o valor em Subtítulo; abaixo, "Só você vê esta
  página." O mesmo filtro de período.
- Os números numa placa #111: pontos em Número (44px) com "pontos" em #b4b4b4 18px, e uma grade 3×3 com valor em
  Subtítulo e o rótulo em #b4b4b4 14px embaixo (Jogos, Vitórias, Empates / Derrotas, Aproveit., Presenças / Gols,
  Assist., Gols/jogo). Sem jogos: "Sem jogos no período." e uma frase de quando aparece.
- "Quartas": `<ol>` de placas #111 (8px entre elas), mais recente primeiro: "Quarta, 28/10" em Inter 500 18px (com o
  ano quando não é o atual), embaixo o resumo em #b4b4b4 ("3 jogos: 2 vitórias, 1 empate · 1 gol") e, à direita, os
  pontos da noite em Subtítulo com "pts" em Giz. Número e palavra nunca quebram de linha separados.
- Dentro da placa de cada quarta, as partidas da noite em ordem, uma linha de 36px em 14px: bolinha e nome do time
  da pessoa em branco, o placar dela primeiro em Inter 600 tabular ("3×1"), o adversário em #b4b4b4 com a bolinha
  dele e, à direita, V/E/D em branco 600 e o que ela fez ("· 1 gol, 1 ast") em #b4b4b4. Leitor de tela ouve a frase
  inteira ("Azul 3 a 1 Laranja, vitória, 1 gol").
- No fim: "Trocar PIN" (pílula secundária) e "Sair deste aparelho" (texto).

### Trocar PIN pelo perfil
- Tela de uma tarefa com as Placas do PIN: "‹ Perfil", h1 por etapa ("Trocar PIN" → "PIN novo" → "Digite de novo")
  e uma frase em #b4b4b4. Primeiro o PIN atual, depois o novo duas vezes; envia sozinho no último dígito. PIN atual
  errado volta ao começo com "PIN atual errado. Tente de novo." e conta para o bloqueio de 5 erros; bloqueado mostra
  até que horas. Deu certo: "PIN trocado", o aviso de que os outros aparelhos vão pedir o PIN e a pílula branca
  "Voltar ao perfil".

### Tela de erro
- Para erro inesperado (`error.tsx`, `global-error.tsx`): título "Algo deu errado" a 80px do topo, uma frase
  em #b4b4b4 com a saída ("Tente de novo; se continuar, avise o admin no grupo.") e a pílula branca
  "Tentar de novo". Nenhum detalhe técnico na tela.

### Placas do PIN (componente-assinatura)
- Quatro placas de 64×76px, raio 10px, 12px entre elas, centralizadas. Um único `<input inputMode="numeric">`
  transparente fica por cima: o toque em qualquer placa abre o teclado numérico, e o leitor de tela vê um
  campo comum.
- **Vocabulário de estado:** vazia = traço curto #2a2a2a; atual = anel interno branco; pendurada = o número
  pintado (Barlow 44px) entra com passo de dois quadros (90ms) e, depois de 0,7s, vira um ponto branco de
  16px sobre a placa alta; erro = placas no fundo de erro com marcas vermelhas, limpas na próxima tecla;
  salvando = pontos lima. Enquanto confere, o campo fica só-leitura (não desabilitado) para o teclado não
  fechar.
- Ao completar 4 dígitos, envia sozinho. Sem botão.

## No PC (≥1024px)

Um corte só, em 1024px (`lg`). Abaixo dele a área admin é exatamente a do celular. Por enquanto só a área admin
muda; as telas do jogador continuam na coluna de 448px.

- **Moldura:** duas colunas. À esquerda o menu lateral de 240px no mesmo chão #000, sem borda (o espaço separa),
  preso na altura da tela: a marca "Pelada" no alto (a mesma da barra do topo), as 7 seções em lista vertical
  (itens de 48px, 4px entre eles, texto alinhado com a marca; a atual em branco sobre placa #111 com
  `aria-current="page"`, as outras em #b4b4b4) e "Sair" no pé, como texto. A barra do topo e as abas somem. No
  teclado, o Tab passa pela marca, pelas seções e pelo Sair antes do conteúdo.
- **Conteúdo:** o `main` ocupa a coluna da direita, alinhado no alto (o h1 a 40px do topo), com 40px de margem
  dos lados e até 1152px de largura, centrado no espaço ao lado do menu. Cada tela decide as próprias colunas;
  o que ainda não foi pensado para o PC fica numa coluna larga.
- **Anotador:** continua a tela cheia do celular, sem menu lateral. As duas colunas só existem quando o menu está
  na tela (variante `admin-pc` no globals.css); sem ele (anotador, partida que não existe) a coluna de 448px
  continua centrada, como antes.
- **Painel:** os blocos numa grade de 3 colunas (8px); a lista ocupa 2, os outros 1, sem sobra na grade.
- **Mensalistas:** a linha de cima traz o seletor de mês (320px) à esquerda e "Desfazer" + "Salvar mensalistas"
  (pílula do tamanho do texto) à direita; logo abaixo o contador "x/16" com a instrução, o aviso de que muda a
  partir da próxima pelada e a mensagem de salvo/erro. Os nomes vêm em colunas de pelo menos 224px (3 em 1024px,
  4 em 1440px). Sem a barra presa no rodapé. A instrução diz "Clique no nome para marcar." (no celular,
  "Toque…").
- **Admins:** a lista de admins na coluna da esquerda e, abaixo, "Novo admin" e "Trocar minha senha" lado a lado
  (duas colunas, 40px entre elas), com o mesmo topo; as dicas reservam duas linhas para as pílulas alinharem.
- **Pelada:** duas colunas iguais com 40px entre elas, abaixo do h1 e da linha "Quarta, 11/11 · Lista aberta". À
  esquerda a "Lista" com o "x/16" e as linhas (abrem no lugar, como no celular); à direita, de cima para baixo,
  "Pôr alguém na lista" (a busca com a Lista tocável), "Fila", "Perderam o prazo" e "Estado da lista". Os dois
  topos ficam na mesma altura. A busca existe em duas cópias com o mesmo estado (uma por largura) para o Tab
  seguir a tela: menu → linhas da lista → busca → fila → estado. O rádio do estado fica 2×2 quando "Automático"
  cabe inteiro (a partir de ~1050px) e numa coluna só a 1024px.
- **Jogadores:** uma coluna de até 768px, alinhada à esquerda (uma tabela de 3 colunas não atravessa a tela). Na
  linha do título, à direita, "Adicionar jogadores" (pílula do tamanho do texto); abaixo, a busca e "Mostrar
  inativos". A tabela: cabeçalho em Giz 14px (Nome · Nota · PIN; "Nota" centrado sobre o seletor) e uma placa #111
  por jogador (8px entre elas, 68px de altura) com as mesmas colunas: o nome (o botão que abre o editor, com a seta
  de 20px no fim da coluna; realce placa alta a 60% no hover; "Inativo" em Giz embaixo), o Seletor de nota na
  própria linha sem o "de 0 a 5" (o limite fica nos botões apagados), salvando com a mesma regra, e a situação do
  PIN em Giz 16px ("Ainda é 1234" / "Trocado"; o leitor de tela ouve "PIN: …"). Clicar no nome abre logo abaixo, na
  mesma placa, o editor de hoje sem o seletor repetido (Nome até 448px, Zerar PIN, Desativar/Reativar; a confirmação
  com a pílula e "Cancelar" lado a lado). Uma linha aberta por vez. O Painel de colar nomes abre no lugar do botão,
  acima da tabela, sem cobrir nada: a área de texto à esquerda e a prévia ao lado, na mesma altura; "Criar N
  jogadores" e "Cancelar" numa linha embaixo.
- **Sorteio:** abaixo do h1 (e da faixa de partida rolando), duas colunas: à esquerda uma de 304px (19rem), à direita
  os times, 40px entre elas. Sem a barra do rodapé e sem folha que sobe.
  - **Antes de sortear:** à esquerda "Pôr mais alguém" e "Quem joga" (as mesmas linhas de marcar); à direita, no
    alto, a pílula "Sortear 14 em 4 times" do tamanho do texto com "2 vagas viram COMPLETE." em Giz ao lado e, abaixo,
    em #b4b4b4, "Os times aparecem aqui, equilibrados pela nota. Antes de marcar como definitivo, dá para trocar quem
    quiser." A coluna dos times fica presa no alto (`sticky`) enquanto a lista de 22+ nomes rola ao lado.
  - **Proposta:** "Quem joga" continua à vista à esquerda (sem o "Mudar quem joga"). À direita, numa linha,
    "Diferença: 0,5" e as pílulas "Marcar como definitivo" (branca) e "Sortear de novo" (secundária), do tamanho do
    texto; se não cabem, descem para a linha de baixo. A diferença fica no meio da altura das pílulas (56px). A
    confirmação com partidas jogadas toma o lugar das pílulas (placa alta até 448px: a frase, "Usar os times novos" e
    "Voltar" na mesma linha). Embaixo, o gesto em Giz ("Clique em dois de times diferentes para trocar.") e os cartões.
    Mexer nas marcas depois de sortear invalida a proposta: o gesto vira "Quem joga mudou. Sorteie de novo para os
    times terem quem está marcado." e a pílula volta a ser "Sortear N em M times".
  - **Cartões:** lado a lado quando a coluna tem ao menos 672px (container query: 4 colunas a partir de ~1340px de
    tela, cada cartão com a largura do celular, ~170px); abaixo disso, 2×2 como no celular. Times de 5 crescem para
    baixo, sem cortar.
  - **Painel ao lado:** escolher um jogador ou um COMPLETE abre, no lugar do conteúdo da coluna da esquerda, uma placa
    #111 (raio 10px, 16px de respiro, sem sombra: não flutua) presa no alto, com o mesmo conteúdo da folha do celular:
    "Trocar Fulano / com alguém de outro time" e "Cancelar"; "Levar Fulano para" com os times e "Tirar do time"; ou a
    folha do COMPLETE (o seletor sem o "de 0 a 5", que não cabe; o limite fica nos botões apagados). O time escolhido
    nunca fica coberto. Fechar, cancelar ou trocar devolve a coluna como estava.
  - **Times definitivos:** à esquerda "Pôr alguém num time" e "Sortear de novo" com a explicação (o que no celular fica
    abaixo dos times; a coluna nunca fica vazia); o aviso ("Fulano agora é do Azul.", "Clique nele para mudar") em
    lima acima da busca ou no Painel. "Quem entra no Azul?" também toma a coluna da esquerda, com os times à vista
    (clicar num time cancela a escolha).
  - **Duas larguras, um estado:** o que muda de lugar (a barra × o alto dos times, a folha × o Painel, a busca dos
    times salvos) existe numa cópia por largura que lê o mesmo estado; depois de hidratar só fica no DOM a da largura
    atual (sem texto, id ou anúncio em dobro). Girar o tablet com alguém escolhido mantém a escolha. No teclado: menu →
    coluna da esquerda → pílulas → cartões.
- **Partidas:** duas colunas, a da direita com 352px (22rem), 40px entre elas, os topos na mesma altura. À esquerda,
  de cima para baixo, "Ficou aberta", "Em andamento" (ou o porquê de não dar para iniciar) e "Próxima partida": os
  times da fila numa linha de 4 quando a coluna tem 640px (a partir de ~1350px de tela; 2×2 abaixo) e a pílula
  "Iniciar Azul × Laranja" do tamanho do texto. "Quem completa o Azul?" e a conferência tomam essa mesma coluna
  ("Jogar sem" e "Iniciar" também do tamanho do texto). À direita, "Já jogadas". "Escolha livre. Clique para trocar."
- **Corrigir partida:** os dois times lado a lado (duas colunas iguais até 896px, 40px entre elas), abaixo do
  confronto; as linhas e os contadores como no celular.

## Do's and Don'ts

### Do:
- **Do** manter fundo #000 e separar superfícies só por luminosidade (#111, #2a2a2a).
- **Do** usar a pílula branca com texto preto para a única ação primária da tela.
- **Do** manter alvos de toque de 56px nos controles principais e nunca menos de 48px.
- **Do** pôr o conteúdo no terço de cima no celular, acima do teclado.
- **Do** usar Barlow Condensed 600 para títulos e números, Inter para frases.
- **Do** escrever mensagens que digam o problema e a saída ("PIN errado. Tente de novo." + "Esqueceu o PIN?
  Peça ao admin para zerar.").

### Don't:
- **Don't** usar lima ou vermelho em botões, abas ou navegação.
- **Don't** pôr sombra, borda ou brilho em superfícies em repouso.
- **Don't** usar fundo azul-marinho ou ardósia no lugar do preto.
- **Don't** pôr rótulo pequeno acima do título, numeração 01/02/03 ou "Passo 1 de 2".
- **Don't** usar emoji ou caractere Unicode como ícone; ícones são SVG de um traço só (1,75px).
- **Don't** desabilitar o campo de PIN durante a conferência (fecha o teclado do celular).
