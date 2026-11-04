# Pelada — documento de design

Data: 2026-11-04 · Status: rascunho para aprovação

Legenda: **[decidido]** = o dono da pelada decidiu na conversa. **[proposta]** = sugestão do Claude que o dono não contestou ou ainda vai revisar. **[builder]** = fica a critério de quem constrói.

## 1. Intenção

Hoje a pelada é organizada por uma lista de texto no grupo do WhatsApp, editada à mão (ver exemplo no apêndice A). O objetivo é um site, aberto no navegador do celular, sem instalar nada, que:

1. organize quem vai na quarta (mensalistas com prioridade, diaristas em fila);
2. sorteie times equilibrados por nota;
3. permita a um admin anotar as partidas ao vivo (gols, assistências, resultado) da forma mais fácil possível, com o celular numa mão;
4. mantenha um ranking geral, por ano e por mês.

É **só para esta pelada** [decidido]. Não é um produto para várias peladas: sem multi-tenant, sem cadastro de outras peladas, sem cobrança.

### Sucesso

- O botão "Copiar lista" substitui a edição manual da lista no WhatsApp.
- Na quarta, o admin anota a noite inteira sem travar, sem errar de jogador sem conseguir corrigir, e no fim o ranking já está atualizado sem nenhum trabalho extra.

### Anti-objetivos (seria fracasso mesmo funcionando)

- Anotar um gol exigir mais que um toque, ou a tela de anotar ser pequena e confusa.
- Alguém conseguir mexer na presença de outra pessoa.
- Jogador precisar lembrar senha complicada ou baixar app.

### Fora do escopo

- Pagamentos (são tratados direto com o dono) [decidido]. O sistema só registra **quem é mensalista em cada mês**, marcado pelo admin.
- Goleiros como posição: não há goleiro fixo, quem está de fora vai pro gol [decidido].
- Notificações push. O aviso é feito copiando a lista pro grupo [decidido].
- Modo offline: o campo tem 4G e Wi-Fi [decidido].

## 2. Pessoas e acesso

### Jogador (perfil comum)
- Entrada: tela "Quem é você?". A pessoa digita o nome, o site sugere os perfis cadastrados, ela escolhe o dela e digita o PIN de 4 números [decidido].
- Todos começam com PIN `1234`. No primeiro acesso o site obriga a trocar [decidido].
- Se esquecer, o admin zera o PIN de volta pra `1234` (e o site pede a troca de novo) [proposta].
- Risco aceito: enquanto alguém não fez o primeiro acesso, outra pessoa poderia entrar no perfil dele com `1234`. Se acontecer, o admin zera o PIN. Para dificultar chutes, depois de 5 PINs errados seguidos o perfil fica bloqueado por 15 minutos [proposta].
- Fica logado no aparelho por muito tempo (ex.: 1 ano), pra não digitar PIN toda semana [proposta].
- O que pode: confirmar ou remover a **própria** presença, entrar na fila de diaristas, ver a lista, copiar a lista, ver o ranking, ver as notas de todos (notas são públicas [decidido]) e ver o próprio perfil.
- O perfil (histórico pessoal, estatísticas detalhadas, troca de PIN) só é acessível pela própria pessoa [decidido]. O ranking e a lista são visíveis para todo jogador logado.
- Todo o site exige login. Ninguém de fora vê nada [proposta].

### Admin
- Conta **separada** do perfil de jogador, para poucas pessoas [decidido]. Se um admin também joga, ele tem as duas contas, e as duas sessões funcionam ao mesmo tempo no mesmo celular (sessões separadas para área admin e área de jogador) [proposta].
- Entrada com usuário + senha [proposta].
- O sistema começa com uma conta admin criada na instalação. Um admin pode criar outros [proposta].
- O que pode: tudo do dia de jogo (sortear, marcar times como definitivos, montar partidas, anotar, desfazer, encerrar, trocar jogadores) [decidido] e o cadastro (criar jogador, editar nome e nota, zerar PIN, marcar mensalistas do mês, abrir/fechar/cancelar a pelada da semana, mexer na lista) [proposta].

## 3. Lista da semana

### Regras
- A pelada é **quarta às 20:30–22:30** [decidido].
- A lista abre uns 2 dias antes [decidido], automaticamente na **segunda às 00:00** [proposta]. O admin também pode abrir, fechar ou cancelar (ex.: chuva) manualmente.
- São **16 vagas** [decidido] (4 times de 4).
- São no máximo 16 mensalistas por mês. O painel não deixa marcar mais que isso [proposta].
- **Mensalistas** do mês entram na lista principal como **pendentes** (⏳), com os botões **Confirmar** e **Remover** [decidido].
- **Prazo do mensalista: quarta às 14h** [decidido]. O mensalista que não confirmou até lá **perde a vaga**, e o primeiro diarista da fila sobe [decidido]. O mensalista que perdeu a vaga pode entrar no fim da fila de diaristas como qualquer um [proposta].
- **Diaristas** (todo mundo que não é mensalista naquele mês, inclusive convidados de fora do grupo [decidido]) marcam interesse e entram numa **fila por ordem de chegada** [decidido].
- Quando sobra vaga na lista principal (um mensalista removeu ou perdeu o prazo), o **primeiro da fila sobe automaticamente** e entra **pendente**. Ele precisa confirmar também [decidido].
- O **diarista que subiu não tem prazo**: pode confirmar ou sair até a hora do jogo. Se sair, sobe o próximo [decidido].
- Se não há mensalistas suficientes no mês, as vagas restantes já ficam abertas para a fila desde a abertura [proposta].
- Pessoa nova (convidado) é cadastrada pelo admin, com nota inicial 3,0 [proposta, baseada na lista real onde convidados aparecem com 3,0].
- O admin pode adicionar ou remover qualquer pessoa da lista, e confirmar por ela, para os casos do dia (gente que chega sem estar na lista) [proposta].

### Botão "Copiar lista"
Disponível para qualquer jogador logado [decidido]. Gera texto no formato que o grupo já usa (apêndice A):

```
Pelada 04/11 - 20:30-22:30

1. Pepe (M) ✅
2. Caio (M) ⏳
3. Nandinho (D) ✅
...
16. Lucas (D) ✅

Interessados pra diarista
1. Bruno
2. Diego
```

✅ = confirmado, ⏳ = pendente [proposta]. Vagas vazias aparecem numeradas e em branco, como hoje.

## 4. Sorteio de times

- Quem entra no sorteio: por padrão, os **confirmados** da lista principal. Antes de sortear, o admin pode tirar quem não apareceu e incluir quem está lá (pendentes ou qualquer cadastrado) [proposta]. A lista é a entrada, sem etapa separada de check-in.
- **4 times de 4** [decidido], usando a nota de cada jogador (0 a 5, de 0,5 em 0,5 [decidido]).
- Objetivo: a soma (ou a média) das notas de cada time a mais parecida possível [decidido].
- O sorteio deve ter variação. Não pode dar sempre os mesmos times com as mesmas pessoas: entre as divisões quase igualmente equilibradas, uma é escolhida ao acaso [proposta].
- **Times alternativos** [decidido]: o admin pode sortear de novo, ver a diferença de força entre os times e trocar dois jogadores de time manualmente antes de fechar.
- Quando o admin marca **"definitivo"**, os 4 times ficam disponíveis para montar partidas [decidido].
- Durante a noite, a composição muda: alguém vai embora, a lista não completou e entra "quem estiver lá" [decidido]. O admin pode trocar, tirar ou colocar jogadores num time entre as partidas. Quem entra tem que estar cadastrado (cadastro rápido pelo admin, só com o nome, se for novo) [proposta].
- Se houver menos ou mais de 16 pessoas, o sorteio deve funcionar com times de tamanho desigual [builder decide os detalhes].
- Algoritmo: [builder]. Com 16 pessoas, buscar muitas divisões aleatórias e ficar com as melhores já resolve.

## 5. Partidas ao vivo (tela do anotador)

### Formato
- Termina com **3 gols** de um time ou com **8 minutos** [decidido].
- **Quem perde sai. Se empatar, saem os dois** [decidido]. Os times de fora entram na ordem da fila de espera.
- Com 4 times: 2 jogam e 2 esperam. O sistema sugere a próxima partida (quem ficou × próximo da fila), mas o admin escolhe livremente quais times jogam [proposta].

### Tela (escolhida: "Anotar A", botão no jogador) [decidido]
- Topo fixo: placar grande, cronômetro contando até 08:00 e uma barra de progresso.
- Abaixo, duas colunas, uma por time, com cada jogador num cartão com dois botões grandes: **GOL** e **AST**. Embaixo do nome aparecem os gols e assistências dele naquela partida.
- **Um toque = um lance** registrado na hora, com uma confirmação visual curta (vibração quando o aparelho permitir) [proposta].
- Botão **Desfazer** sempre visível, que desfaz o último lance [decidido]. Pode ser tocado várias vezes seguidas.
- Botão **Encerrar** [decidido].
- Ao chegar no 3º gol de um time, o site sugere encerrar ("Azul venceu 3×1 — encerrar?"), sem encerrar sozinho, pra dar chance de desfazer um toque errado [proposta].
- Quando o cronômetro chega a 8:00, o site avisa (som/vibração) e mostra o encerramento com o resultado atual [proposta].
- Tem que caber numa tela de celular comum sem rolar, com 4 jogadores por time. Botões grandes o bastante pra tocar sem olhar direito.
- A tela não deve apagar enquanto a partida está em andamento (Wake Lock, quando o navegador suportar) [proposta].
- Se o celular recarregar a página ou outro admin abrir, a partida continua de onde estava: os lances ficam salvos no servidor a cada toque, e o cronômetro é calculado a partir da hora de início salva [proposta].

### Ao encerrar
- Cada jogador dos dois times ganha **1 jogo** [decidido].
- Time vencedor: **1 vitória** para cada jogador. Perdedor: **1 derrota**. Empate: **1 empate** para todos dos dois times, e não derrota [proposta, aceita implicitamente].
- O admin pode corrigir uma partida já encerrada (adicionar/remover lance, trocar resultado) [proposta]. Por isso **as estatísticas são sempre calculadas a partir dos lances e resultados salvos**, nunca de contadores somados à parte.

## 6. Ranking e estatísticas

- Filtro de período: **Geral, Ano, Mês** [decidido].
- **Pontuação: vitória 3, empate 1, gol 1, assistência 1** [decidido]. É a ordem padrão do ranking.
- Desempate: mais vitórias, depois mais gols, depois menos jogos [proposta].
- Colunas [proposta]: pontos, jogos, vitórias, empates, derrotas, aproveitamento (%), gols, assistências, gols por jogo, presenças (quartas em que jogou pelo menos uma partida). Tocar numa coluna reordena por ela.
- Destaques do período no topo: artilheiro, garçom (mais assistências) e quem mais venceu [proposta].
- Perfil do jogador (só ele vê): os mesmos números com os mesmos filtros, mais o histórico das quartas e partidas [proposta].

## 7. Painel admin

- Jogadores: criar, editar nome, editar nota, zerar PIN, desativar (quem parou de vir some das listas, mas o histórico fica) [proposta].
- Mensalistas do mês: marcar e desmarcar quem é mensalista em cada mês [proposta]. Por padrão, um mês novo copia a lista do mês anterior.
- Pelada da semana: abrir, fechar, cancelar, mexer na lista.
- Dia de jogo: sorteio, times, partidas, anotador.
- Admins: criar outra conta admin, trocar a própria senha.

## 8. Abordagens consideradas

| | Opção | A favor | Contra |
|---|---|---|---|
| **A** ✅ | Next.js + Postgres, tudo na Vercel | Uma conta só (a mesma Vercel que o dono já usa); Postgres resolve bem o ranking com filtros | A atualização não é instantânea: a página consulta de novo a cada poucos segundos |
| B | Next.js na Vercel + Supabase (tempo real) | Mudanças aparecem na hora | Duas contas; o plano grátis do Supabase pausa o banco após 7 dias sem uso |
| C | Firebase | Tempo real e offline | Banco sem tabelas deixa ranking e filtros trabalhosos |

**Escolhida: A** [decidido]. Motivo: a parte difícil do sistema são os números, não a atualização instantânea, e o deploy é na Vercel [decidido].

## 9. Restrições técnicas e decisões já tomadas

- Deploy na **Vercel** [decidido]. Banco Postgres provisionado pela Vercel (Neon) [proposta].
- Next.js (App Router) + TypeScript [proposta]. Mobile first, em português do Brasil.
- O fuso horário é **America/Recife** (horário de Brasília, sem horário de verão) [proposta]. Prazos (segunda 00:00, quarta 14:00) seguem esse fuso.
- Prazos sem depender de agendador: o estado da lista é calculado quando alguém abre a página (ex.: depois de quarta 14h, quem está pendente entre os mensalistas já aparece como fora) [proposta]. Um agendador (Vercel Cron) pode servir de reforço.
- Atualização da lista e do placar para quem está olhando: nova consulta a cada poucos segundos enquanto a página está aberta [proposta].
- Processo: git flow (feature/* a partir da develop → PR → revisão → merge), commits organizados, sem atribuição de IA em commits ou PRs [decidido].
- **Interfaces:** toda tela é desenhada e revisada com as skills **impeccable** e **taste-skill (design-taste-frontend)** [decidido]. Cada PR com tela nova ou alterada relata o que essas revisões apontaram e o que foi corrigido.
- Testes automáticos obrigatórios para as regras: fila e promoção de diaristas, prazo das 14h, sorteio equilibrado, encerramento de partida e pontuação do ranking [proposta].

## 10. Deixado para quem constrói

- Biblioteca de banco/ORM, de estilos e de componentes.
- Modelo de dados exato (com o princípio: estatísticas derivadas de lances).
- Algoritmo de sorteio, desde que equilibrado e com variação.
- Visual final (cores, tipografia), respeitando a tela "Anotar A" e a legibilidade ao ar livre (contraste alto).
- Detalhes do texto copiado além do formato do apêndice A.

## Apêndice A — lista real de 04/11 (como é hoje)

```
Pelada 04/11 - 20:30-22:30

1. Pepe (M) ✅
2. Caio (M) ✅
3. Nandinho ✅️ (D) convidado Israel 3,0
4. Rodrigo (M) ✅
5. Marquinho (M) ✅
6. Manoel (?) ✅
7. Luiz (M) ✅
8. Jonas (M) ✅
9. Ronaldo 3.0✅
10. Silvio (M) ✅
11. Israel (M) ✅
12. Renan (?)
13.
14. Rayan conv 3,0 ✅️
15. Rayanderson (M)✅
16. Lucas conv 3,0 ✅️

Interessados pra diarista
1.
```
