# Robô do WhatsApp — desenho

Adendo ao desenho principal (`2026-11-04-pelada-design.md`). Pedido do usuário em 10/11/2026: em vez
de cada um copiar e colar a lista no grupo, um robô manda a lista sozinho.

## Por quê

Hoje quem mexe na lista precisa tocar em "Copiar lista" e colar no grupo, e quase ninguém faz. O
grupo fica sem saber o estado da lista. O robô avisa quando a lista abre, mostra o que mudou e lembra
do prazo dos mensalistas, sem ninguém precisar copiar nada.

## Objetivos

- Um número de WhatsApp que o usuário tem sobrando (já adicionado ao grupo **"Pelada 3.0"**) manda
  mensagens nesse grupo, sozinho, nos horários abaixo.
- Cada mensagem traz a lista atual no **mesmo formato do "Copiar lista"** (`textoWhatsApp`), com um
  cabeçalho dizendo o que aconteceu.
- Roda no Mac do usuário (decisão dele, "por enquanto").

## Fora do escopo (anti-objetivos)

- Ler ou responder mensagens do grupo (ninguém confirma presença pelo WhatsApp; continua pelo site).
- Mensagem individual para cada jogador.
- API oficial da Meta (não manda em grupo existente; exige empresa e cobra por mensagem).
- Spam: nunca uma mensagem por mudança; nunca mensagem sem mudança.
- Mudar regras da lista ou gravar algo no banco do site.

## Quando o robô fala (horário de Recife)

1. **Segunda 14:00 — "lista aberta":** "A lista de quarta, 11/11 está aberta." + a lista atual.
   (A lista abre à meia-noite; a mensagem sai à tarde, por decisão do usuário.)
2. **A cada 30 minutos (:00 e :30), se mudou algo desde a última mensagem enviada:** cabeçalho com o
   que aconteceu no intervalo + a lista atual. Sem mudança, nada. Vale de segunda 14:30 até quarta
   20:30 (início do jogo).
3. **Quarta 12:00 — lembrete:** "Faltam 2 horas para os mensalistas confirmarem. Ainda não
   confirmaram: Fulano, Beltrano." + a lista. Se todos já confirmaram, não manda o lembrete.
4. **Quarta 14:00 — prazo encerrado:** "Prazo dos mensalistas encerrado. Perderam a vaga: Fulano.
   Subiram da fila: Ciclano." + a lista. (Usuário escolheu esta opção "A": o prazo do site continua
   14:00, e o aviso de "precisa confirmar" vem às 12:00.)

Regras de convivência:
- **Silêncio das 23:00 às 08:00:** nada sai; o que mudou nesse período vai junto na mensagem das 08:00.
- Quando uma rodada de 30 min cai num horário fixo (12:00, 14:00), sai uma mensagem só, com o texto do
  horário fixo e o cabeçalho das mudanças.
- **Pelada cancelada** pelo admin: uma mensagem "A pelada de quarta, 11/11 foi cancelada." e o robô
  para até a semana seguinte. Lista **fechada à mão**: entra no cabeçalho ("O admin fechou a lista.").
- A primeira mensagem da semana é sempre a de "lista aberta" (ou, se o robô só ligar depois, a
  primeira que ele mandar, sem cabeçalho de mudanças: "Lista de quarta, 11/11:" + a lista).

## O cabeçalho das mudanças

Calculado comparando a lista atual com a **última lista que o robô mandou** (não com a de 30 min
atrás), então nada se perde se uma rodada não sair. Uma linha por tipo, só os que aconteceram, nesta
ordem:
- "Confirmaram: Y e Z." (pendente → confirmado)
- "Saíram: X." (saiu da lista ou da fila)
- "Entraram na lista: W." (entrou direto, com vaga)
- "Subiram da fila: K." (fila → lista)
- "Foram para a fila: L." (lista → fila, ex.: mexida do admin)
- "Entraram na fila: J."
- "Perderam o prazo: M." (só a partir de quarta 14:00)
- "O admin fechou/reabriu a lista."
Nomes juntados em pt-BR ("A, B e C"). Mensagem curta: cabeçalho, linha em branco, lista.

## Onde e como roda

- **Programa pequeno em Node/TypeScript dentro do mesmo repositório** (pasta própria), usando a
  biblioteca **Baileys** (conexão como "aparelho conectado", como o WhatsApp Web; sem navegador
  escondido). Usuário perguntou sobre a Evolution API: é um servidor pronto em cima da Baileys, com
  Docker e banco próprio; pesado demais para ficar ligado no Mac só para isto (ver Abordagens).
- **Lê a lista direto no banco do site** (Neon, mesma `DATABASE_URL`), reaproveitando as funções do
  site (`estadoDaSemana`, `textoWhatsApp`), para a lista ser idêntica à do site e à do "Copiar lista".
  O site na Vercel não muda e não precisa falar com o Mac; o Mac não fica exposto na internet.
  Observação: `estadoDaSemana` cria a pelada da semana depois da abertura de segunda (comportamento
  normal do site); fora isso o robô não escreve nada no banco.
- **Guarda no Mac** (pasta do usuário, fora do repositório): o login do WhatsApp e a última lista
  enviada (com a hora), para saber o que mudou e sobreviver a reinício/desligamento.
- **Mac desligado em parte do tempo:** ao voltar, o robô compara com a última lista enviada e manda
  uma mensagem só com tudo o que mudou. Horários fixos que já passaram são pulados (nada de "lista
  aberta" na terça, nem lembrete das 12:00 às 17:00), exceto o "lista aberta", que sai se o robô
  ligar ainda na segunda.
- **Liga sozinho com o Mac** (serviço de login do macOS); fora de segunda 14:00 → quarta 20:30 fica
  parado; dentro dessa janela impede o Mac de dormir enquanto roda.
- **Primeira vez:** o usuário lê um QR code com o celular do número sobrando; o robô acha o grupo
  "Pelada 3.0" pelo nome e guarda o identificador.
- **Modo de ensaio:** mostra no terminal as mensagens que mandaria, sem enviar. Antes de valer no grupo
  de verdade, um teste num grupo de teste do usuário.

## Abordagens consideradas

| Abordagem | Prós | Contras | Decisão |
|---|---|---|---|
| **Baileys direto, no Mac** | leve, sem Docker; um programa só nosso; reaproveita o código do site | não é oficial (risco de bloqueio do número); depende do Mac ligado | **escolhida** |
| Evolution API (Docker) no Mac | painel pronto, várias contas | Docker ligado 3 dias no Mac; muito além do necessário | descartada por ora (faz sentido num servidor no futuro) |
| whatsapp-web.js | popular | roda um Chrome escondido o tempo todo (memória/bateria) | descartada |
| API oficial da Meta | oficial | não manda em grupo existente; empresa verificada; paga | descartada |
| Servidor sempre ligado (Railway ~US$5/mês, Oracle grátis) | não depende do Mac | custo/manutenção | adiada: usuário escolheu o Mac "por enquanto" |

## Riscos

- **Bloqueio do número sobrando** pelo WhatsApp (uso não oficial). Baixo com poucas mensagens por
  semana num grupo que conhece o número; se acontecer, perde-se só o número sobrando.
- Mac dormindo/desligado: mensagens atrasam (o resumo sai quando voltar); horários fixos podem ser
  pulados.
- Sessão do WhatsApp cair: o robô avisa no terminal/log e pede novo QR.

## Decisões do Claude (o usuário pode mudar)

- Segunda **14:00** para "lista aberta"; silêncio **23:00–08:00**; rodadas até **20:30** de quarta.
- Cabeçalho inclui o que o admin fizer pelo site (muda a lista do mesmo jeito).
- Lembrete das 12:00 não sai se todos os mensalistas já confirmaram.
- Pelada cancelada: uma mensagem e para; lista fechada à mão vai no cabeçalho.
- Horários fixos perdidos (Mac desligado) não saem atrasados, exceto "lista aberta" no mesmo dia.
- Quarta 14:00 sem ninguém que perdeu a vaga: "Prazo encerrado: todos os mensalistas confirmaram." + a lista.
- Pelada cancelada e depois reaberta pelo admin: o robô volta a falar, com "A pelada de quarta, 11/11
  voltou." + a lista.
- Dois grupos com o nome "Pelada 3.0": o robô para e pede para escolher na primeira configuração.
- O estado guardado no Mac tem, por jogador, o id, o nome e onde estava (lista confirmado/pendente, fila,
  perdeu o prazo), além do estado da pelada (aberta/fechada/cancelada) — o cabeçalho é a diferença disso.
- Mac com a tampa fechada dorme mesmo com o robô pedindo para ficar acordado (limite do macOS, a menos
  que esteja na tomada com monitor externo). Nos dias da pelada, deixar o Mac aberto e na tomada.

## Fica para quem constrói

- Estrutura da pasta do robô, nomes, formato do arquivo de estado, como instalar o serviço do macOS.
- Testes: as regras (quando falar, o cabeçalho, juntar nomes, silêncio, horários perdidos) como
  funções puras testadas sem WhatsApp; o envio de verdade só no ensaio e no grupo de teste.
