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
- **Número** (Barlow Condensed 600, 44px, 1): o dígito pintado na placa do PIN; depois o placar e a contagem.
- **Marca** (Barlow Condensed 600, 24px): "Pelada" no topo.
- **Linha** (Inter 500, 18px, 1.4): itens tocáveis (nomes sugeridos), texto de campo, rótulo do botão.
- **Corpo** (Inter 400–500, 16px, 1.5): descrições, rótulos, mensagens. Nada abaixo de 16px em campo (evita o
  zoom do iPhone) e nada abaixo de 14px em texto.

### Named Rules
**A Regra da Placa.** Barlow Condensed só em títulos, na marca e em números. Frases corridas, rótulos e
botões são Inter. Caixa normal, sem letras espaçadas em maiúsculas.

## Layout

Coluna única de até 448px (`max-w-md`), margens laterais de 20px, barra do topo de 56px no mesmo fundo. No
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
- Linha de texto logo abaixo da barra (Painel · Pelada · Jogadores · Mensalistas · Admins), Inter 500 16px, itens de
  48px de altura com 10px de folga lateral. Seção atual: texto branco sobre placa #111 (raio 10px) e
  `aria-current="page"`; as outras em #b4b4b4, branco no hover. Sem lima, sem sublinhado. Se não couber,
  rola de lado, sem quebrar linha. Só existe dentro da área admin; /admin/entrar não tem.

### Linha de jogador recolhível (admin)
- Placa #111, raio 10px, em lista com 8px de intervalo. Fechada: 56px, nome em Inter 500 18px (truncado), meta
  em Giz 16px abaixo ("Inativo", "PIN ainda é 1234"), nota em Barlow 28px à direita e seta que gira 90° ao
  abrir. Só uma linha aberta por vez; a aberta mostra o seletor de nota e as ações.

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
