# Product

<!-- impeccable:product-schema 1 -->

> Escrito sem entrevista ao vivo: os fatos vêm do documento de design aprovado
> (`docs/superpowers/specs/2026-11-04-pelada-design.md`) e do plano. Tudo marcado
> *(inferido)* é leitura do builder e pode ser corrigido pelo dono.

## Platform

web

## Users

- **Jogador**: um dos ~25 amigos da pelada de quarta. Abre o site no celular, quase sempre
  vindo de um link no grupo do WhatsApp, para confirmar presença, entrar na fila, ver a lista,
  o ranking e o próprio perfil. Uso curto, uma vez ou duas por semana.
- **Admin**: poucas pessoas (o dono e quem ajuda). Cadastra jogadores, marca mensalistas,
  sorteia times e anota as partidas ao vivo na beira da quadra, com o celular numa mão.

## Product Purpose

Substituir a lista de texto editada à mão no WhatsApp por um site sem instalação que organiza
quem vai na quarta (mensalistas com prioridade, diaristas em fila), sorteia times equilibrados
por nota, deixa o admin anotar gols e assistências ao vivo e mantém um ranking.
Sucesso: o botão "Copiar lista" aposenta a edição manual, e o admin anota a noite inteira sem
travar. Só para esta pelada: sem multi-tenant, sem cobrança.

## Operating Context

- Pelada às quartas, 20:30–22:30, fuso America/Recife. Lista abre segunda 00:00; prazo do
  mensalista quarta 14:00. 16 vagas, 4 times de 4 (coletes azul, laranja, verde, preto).
- Uso no celular, em grande parte à noite e ao ar livre, na quadra com refletores *(inferido do
  horário e do pedido de contraste alto)*.
- Entrada do jogador: "Quem é você?" → digita o nome → escolhe o seu → PIN de 4 números.
  Todos começam com 1234 e trocam no primeiro acesso. Fica logado por 1 ano.

## Capabilities and Constraints

- Todo o site exige login (jogador ou admin), exceto as telas de entrar.
- Sessões de jogador e de admin são separadas e convivem no mesmo aparelho.
- 5 PINs errados seguidos bloqueiam o perfil por 15 minutos.
- Interface em português do Brasil. Mobile first. Sem app, sem push, sem offline.

## Brand Commitments

- Nome: **Pelada**. Sem logo nem cores definidas pelo dono.
- Contraste alto (uso ao ar livre, à noite) e alvos de toque grandes, uma mão só [decidido].
- Tom: conversa entre amigos, direto, sem jargão de sistema *(inferido)*.

## Evidence on Hand

- A lista real do WhatsApp de 04/11 (apêndice A do design). Nenhuma foto, logo ou marca.
  Não inventar números, depoimentos nem estatísticas.

## Product Principles

1. Zero atrito: o jogador entra em segundos e não precisa lembrar senha complicada.
2. Cada um mexe só no que é seu; o admin mexe em tudo.
3. Legível na quadra: contraste alto, letras e botões grandes, uma mão.
4. A lista do grupo continua sendo o ritual; o site serve a ela.

## Accessibility & Inclusion

- Alvos de toque de pelo menos 48px; texto com contraste de pelo menos 4,5:1.
- Teclado numérico para PIN (`inputMode="numeric"`).
