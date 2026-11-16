# Robô: privado dos organizadores, times com 2 de 3, link de anotar e duplas separadas — desenho

Adendo a `2026-11-16-robo-cadastrar-design.md`. Pedido do usuário em 16/11/2026.

## Por quê

- Na última pelada os times foram sorteados em outro app: o pessoal não sabia que o robô sorteava, e
  Luiz e Jonas não podem cair no mesmo time. Para não parecer armação, os organizadores sorteiam
  escondidos e mostram só o resultado, que não entra no site. Sem times no site, a tela de anotar gols e
  assistências não funciona.
- Quem anota as partidas precisa entrar como organizador. Hoje isso obriga a passar usuário e senha.

## Objetivos

1. O robô atende **no privado** só os três organizadores (os números de `ROBO_ADMINS`: dono, Pepe e
   Jonas), para as tarefas de organização.
2. Os times sorteados ou importados **só valem com 2 dos 3 organizadores** confirmando. Ao valer, vão
   para o site (libera as partidas) e são anunciados no grupo.
3. Os times **não vazam**: enquanto a confirmação rola, ninguém no grupo vê a proposta feita no privado.
4. **Link temporário de anotar:** abre só as telas de partida, sem senha, e vale só naquela noite.
5. **Duplas separadas:** o sorteio (site e robô) nunca junta uma dupla da lista (de começo, Luiz e
   Jonas). A lista só é vista pelos organizadores.
6. Depois do item 2 no ar, e com o OK do usuário, o robô manda no privado dos três um aviso explicando o
   canal. O aviso diz que o time sorteado só vale depois de confirmado e que dá para sortear de novo.

## Fora do escopo

- Privado para qualquer outra pessoa: mensagem no privado de outro número é ignorada (linha no log).
- Confirmar times pelo site; mudar a regra do sorteio além das duplas separadas.
- Mostrar a regra das duplas ao grupo (decisão do usuário: só organizadores veem).

## Decisões do usuário

- O "2 de 3" conta quem sorteou: quem sorteou ou importou também responde **sim**, e esse é o primeiro
  voto. O segundo voto, de outro organizador, faz valer.
- O link de anotar é temporário, sem senha, e só abre as telas de partida.
- O `sortear` no grupo continua existindo (ver "Sorteio no grupo").
- As duplas separadas ficam visíveis só para os organizadores.

## O privado (parte A)

- Mensagem no privado vinda de um número de `ROBO_ADMINS` é atendida, sem precisar marcar o robô.
  Remetente que só aparece como LID (sem telefone) não é reconhecido: o robô ignora e registra no log.
  O leitor de mensagens (`lerMensagemRecebida`) hoje descarta tudo que não é grupo; ganha um caminho
  para o privado. Se o teste ao vivo mostrar privados só com LID, a ligação LID↔telefone que o WhatsApp
  informa entra já na parte A (sem ela o canal não funciona).
- Valem todos os comandos do grupo, mais os de organizador:

| Comando | O que faz |
|---|---|
| `cadastrar Nome - nota` | Igual ao do grupo (já existe). |
| `notas` | Todos os jogadores ativos com a nota, em ordem alfabética. |
| `nota Fulano 3,5` | Muda a nota (0 a 5, de 0,5 em 0,5), pela mesma função do site. Acha o nome como o `adicionar`, inclusive a sugestão "você quis dizer". |
| `site` / `link` | O endereço do site (`ROBO_URL_SITE`, padrão `https://pelada-black.vercel.app`). |
| `sortear` / `sortear 3 times` | Proposta de times (parte B). |
| `importar` + times colados | Proposta com os times feitos fora (parte B). |
| `sim` | Voto na proposta pendente (parte B). |
| `anotar` | O link temporário de anotar (parte C). |
| `ajuda` | A ajuda do grupo mais os comandos de organizador. |

- Texto livre vai para a IA, com as ferramentas do grupo mais as de organizador (notas, mudar nota,
  cadastrar, sortear, importar, link de anotar). A IA nunca dá o voto (o `sim` continua só pelo comando).
- As notas já são públicas no site (tela de Ranking), então o privado não esconde nada novo: ele só junta
  as ferramentas de mexer em nota e cadastro num lugar onde só os organizadores mandam.
- Freio e limite valem igual. O silêncio das 23h às 8h **não** vale no privado (só responde a quem
  escreveu; ninguém é acordado).

## Times com 2 de 3 (parte B)

- **Uma proposta pendente por vez**, guardada no estado do robô no Mac (`estado.json`; o `lerEstado` hoje
  descarta campos desconhecidos e precisa aceitar o novo), para sobreviver a reinício: depois de reiniciar,
  a proposta e os votos voltam, respeitando a validade. Ela tem: os elencos e os COMPLETE (como a proposta de hoje), a pelada, a origem (sorteio ou
  importação), quem propôs, a hora e os votos (telefones).
- Uma proposta nova substitui a anterior e zera os votos. Os outros organizadores recebem um aviso no
  privado.
- **Sortear no privado:** o robô mostra os times (com notas, só no privado) ao organizador e manda a
  mesma proposta no privado dos outros dois:
  "🎲 Pepe sorteou os times: … Responda *sim* para confirmar. Precisa de 2 dos 3 organizadores; quem
  sorteou também confirma."
- **Importar no privado:** `importar` seguido dos times colados (o formato do "Importar times" do site,
  `previaDosTimes`). Se algum nome não for achado ou estiver ambíguo, o robô responde o que faltou (com
  "você quis dizer") e pede para mandar de novo corrigido. Lido certinho, vira proposta como a do
  sorteio. Se a proposta juntar uma dupla separada, vai junto um aviso só no privado: "⚠️ Luiz e Jonas
  estão no mesmo time."
- **Voto:** `sim` de um organizador (reconhecido pelo telefone; sem telefone, não conta) conta uma vez.
  O atalho de hoje (responder à mensagem do robô com `sim`, sem marcar) vale para qualquer um dos três
  organizadores, não só para quem propôs; a ideia de "um só dono da proposta" (`adminTelefone`,
  `simDeQuemPediu`) vira a lista de votos. Cada voto novo é avisado no privado dos outros
  ("✅ Jonas confirmou. Falta 1."). No segundo voto, o robô:
  1. salva os times pelo caminho do site (`salvarTimesDefinitivos`, com as mesmas recusas, como "a lista
     mudou desde o sorteio" ou partidas já jogadas). Recusado: a proposta acaba e os três recebem o
     motivo no privado;
  2. avisa os três no privado ("🏆 Times confirmados e salvos no site.");
  3. manda no grupo os times **sem notas** ("🏆 Times da noite:" e os times, no formato do `times`).
- **Validade:** a proposta vence em 60 minutos ou quando outra a substitui (vale também para o sorteio
  no grupo; hoje são 10 minutos). Voto em proposta vencida:
  "⌛ Essa proposta venceu. Peça *sortear* (ou *importar*) de novo."
- **Sem vazamento:** `times` no grupo (comando e IA) só lê os times salvos no site e nunca a proposta.
  Sem times salvos, responde "👕 Os times de hoje ainda não foram definidos." (com ou sem proposta, para
  não dar pista). Com times já salvos e um novo sorteio pendente, mostra os salvos, que seguem valendo até
  o novo ser confirmado.
- **Sorteio no grupo** (decisão do usuário de manter): o `sortear` de organizador no grupo mostra a
  proposta no grupo, como hoje, e entra na mesma regra de 2 de 3. Os votos valem com `sim` no grupo ou
  no privado, e ela é a mesma proposta única (substitui a do privado, e vice-versa).

## Link temporário de anotar (parte C)

- `anotar` no privado (ou pela IA no privado) cria uma chave aleatória (32 bytes) e responde
  `…/anotar/<chave>`. Só no dia da pelada (a pelada de hoje); em outro dia: "📅 Hoje não tem pelada para
  anotar." O banco guarda só o hash da chave, a pelada, quem pediu e o vencimento: 3h da manhã seguinte,
  horário de Recife (cobre partidas que passam da meia-noite).
- Pedir um link novo invalida o anterior da mesma pelada.
- Quem abre o link ganha um cookie de anotador e cai na tela de partidas da noite. Com esse cookie:
  - **libera:** só as telas de partida (`/admin/partidas` e `/admin/partida/[id]`) e as ações delas
    (iniciar, anotar, desfazer, encerrar), e só para a pelada da chave;
  - a cada página e ação, o site confere a chave no banco (vencida ou invalidada = sem acesso) e que a
    partida é da pelada da chave. Hoje o `proxy.ts` e o `exigirAdmin()` das ações só aceitam o login de
    organizador; os dois ganham o caminho do anotador só para essas rotas e ações;
  - **barra:** o resto da área de organizador e as outras ações (jogadores, notas, sorteio, mensalistas,
    admins), que continuam exigindo login de organizador.
- Link vencido ou invalidado: página simples "Esse link de anotar venceu. Peça um novo a um
  organizador."

## Duplas separadas (parte D)

- Tabela nova de duplas (dois jogadores por linha, sem repetir a dupla), começando com Luiz e Jonas.
- Uma seção "Duplas separadas" na tela de Sorteio do organizador, para adicionar e remover duplas. Só
  organizadores veem.
- `sortearTimes`/`sortearComCompletes`/`sortearDaNoite` recebem as duplas e descartam qualquer divisão
  que junte uma delas, mantendo a tolerância de soma de hoje. Se não achar divisão dentro da tolerância,
  fica com a de menor diferença que respeita as duplas. Se nem isso der (ex.: 2 times e 3 pessoas que
  se excluem), sorteia sem a regra e avisa só ao organizador.
- O sorteio do site e o do robô passam as duplas. A proposta e o anúncio não citam a regra.
- Mover jogador à mão entre os times no site não avisa nem bloqueia (é escolha do organizador).

## Ordem de entrega

PRs separados, um de cada vez: **A** (privado + notas + site) → **B** (2 de 3, importar, anúncio, sem
vazamento) → aviso de estreia no privado, com o OK do usuário → **C** (link de anotar) → **D** (duplas
separadas).

## Decisões do Claude (o usuário pode mudar)

- Proposta vence em 60 minutos.
- Sem silêncio no privado.
- Os outros organizadores recebem no privado cada proposta nova e cada voto.
- No grupo os times anunciados vão sem notas. A proposta do `sortear` no grupo continua como hoje
  (com notas), já que o usuário quis manter o sorteio lá.
- Link de anotar: um válido por pelada, até as 3h da manhã seguinte; só no dia da pelada.
- `times` no grupo sem times salvos diz "ainda não foram definidos", com ou sem proposta pendente.
- Proposta recusada pelo site ao salvar (ex.: partidas já jogadas) acaba, e os três recebem o motivo.
- Voto só conta com telefone reconhecido; LID sozinho não vota.
- Importação com dupla separada junta: só um aviso no privado, não bloqueia.

## Riscos

- O privado no WhatsApp às vezes chega só com o LID, sem telefone. Nesse caso o robô não reconhece o
  organizador. Isso precisa ser testado ao vivo com os três; se acontecer, guardar a ligação LID↔telefone
  que o WhatsApp informa.
- Mensagens no privado por um número não oficial aumentam um pouco o risco de bloqueio. O volume é
  baixo e são três pessoas que conhecem o número.

## Fica para quem constrói

- Nomes, formato da proposta no `estado.json`, tela das duplas, estrutura das rotas de anotar.
- Testes: comandos e votos como funções puras com falsos (como hoje); a guarda do anotador e as duplas
  no sorteio com banco de teste; o envio de verdade só no teste ao vivo.
