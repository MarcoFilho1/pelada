# Guia do admin

Este guia é para quem cuida da pelada pelo celular. Tudo fica no painel: `/admin`. O menu de baixo tem Painel, Pelada, Sorteio, Partidas, Jogadores, Mensalistas e Admins.

## Primeiro dia

1. **Criar o primeiro admin.** Quem instala o site roda `pnpm db:seed` com `ADMIN_USUARIO` e `ADMIN_SENHA` definidos (senha com pelo menos 10 caracteres). Se já existir algum admin, o comando não faz nada. Depois, entre em `/admin/entrar` com esse usuário e senha. Para dar acesso a outra pessoa, use **Admins > Novo admin**.
2. **Colar os nomes dos jogadores.** Em **Jogadores**, toque em **Adicionar jogadores** e cole a lista do grupo, um nome por linha. Pode colar a lista do WhatsApp como está: número, `(M)`, `(D)` e ✅ saem sozinhos. A tela mostra quem vai entrar e quem fica de fora (nome que já existe ou repetido). Toque em **Criar jogadores**.
3. **Ajustar as notas.** Todo mundo começa com 3,0. Na lista de Jogadores, toque no nome e use os botões de menos e mais (de 0,5 em 0,5, entre 0 e 5). A nota salva sozinha. O sorteio usa essa nota para equilibrar os times.
4. **Marcar os mensalistas do mês.** Em **Mensalistas**, escolha o mês e marque quem tem vaga fixa (no máximo 16), depois toque em **Salvar mensalistas**. Se o mês ainda não foi salvo, a tela mostra a lista copiada do mês anterior, mas ela só fica guardada quando você salva. Mudanças valem a partir da próxima pelada; para a semana que já abriu, ajuste em **Pelada**.
5. **Avisar o grupo.** Todo jogador entra em `/entrar`, escolhe o nome e usa o PIN **1234**. No primeiro acesso o site obriga a trocar por um PIN novo de 4 números (1234 não vale). O aparelho fica logado por um ano.

## Rotina da semana

- **Segunda 00:00:** a lista abre sozinha. Os mensalistas do mês entram como pendentes (⏳) e os diaristas vão entrando na fila por ordem de chegada.
- **Virou o mês?** Salve os mensalistas do mês novo **antes de segunda 00:00 da primeira semana do mês** (a quarta é que define o mês). Quando a lista da semana abre pela primeira vez, o site monta os mensalistas com o que estiver salvo; se o mês novo não foi salvo, ele copia o mês anterior. Esquecendo, ajuste essa semana à mão em **Pelada** (adicione, tire ou confirme as pessoas) e salve o mês para as próximas.
- **Até quarta 14:00:** o mensalista confirma a presença. Quem não confirmar perde a vaga e o primeiro da fila sobe (também pendente, e sem prazo: confirma até a hora do jogo). O mensalista que perdeu o prazo ainda pode entrar no fim da fila.
- **Copiar a lista para o grupo:** qualquer pessoa logada vê o botão **Copiar lista pro WhatsApp** na tela Lista. O texto sai pronto: `Pelada DD/MM - 20:30-22:30`, 16 vagas numeradas com ✅ (confirmado) ou ⏳ (pendente) e a fila de diaristas.
- **Mexer na lista:** em **Pelada** você adiciona, tira ou confirma por qualquer pessoa (quem chega sem estar na lista, por exemplo). Também escolhe o estado: *Automático* (abre segunda 00:00, fecha no fim do jogo), *Aberta* (fica aberta até você mudar), *Fechada* (ninguém entra nem confirma, os jogadores ainda podem sair) ou *Cancelada* (a lista e o texto mostram que a pelada foi cancelada; não dá para cancelar se já houve partida).
- **Jogador novo (convidado):** cadastre em **Jogadores** (ou pelo cadastro rápido no Sorteio). Entra com nota 3,0 e PIN 1234.

## Noite da pelada (quarta)

1. **Sorteio.** Em **Sorteio**, confira quem vai jogar (por padrão, os confirmados; tire quem não veio e inclua quem apareceu). Toque em sortear. Dá para **Sortear de novo**, trocar dois jogadores de time à mão e ver a diferença de força entre os times.
2. **Definitivo.** Quando gostar, toque em **Marcar como definitivo**. Só os times definitivos podem jogar. Durante a noite você ainda pode mover, tirar ou colocar jogadores num time entre as partidas.
3. **Partidas.** Em **Partidas** o site sugere o próximo confronto pela fila de times. Toque em **Iniciar** (só funciona no dia da pelada; uma partida de cada vez).
4. **Anotador.** Cada jogador tem um cartão com **GOL** e **AST**. Cada toque é um lance, o placar muda na hora. **Desfazer** tira o último lance. A partida termina com 3 gols ou 8:00: o site avisa e pergunta "encerrar?", mas nunca encerra sozinho. Não existe gol contra: o placar é a soma dos gols dos jogadores de cada lado.
5. **Encerrar.** Toque em **Encerrar partida**. Você volta para **Partidas**, onde a partida aparece em **Já jogadas**. Vitória vale 3 pontos, empate 1, gol 1 e assistência 1. O ranking se atualiza sozinho.

### Corrigir uma partida

Em **Partidas**, na lista **Já jogadas**, toque em **Corrigir** ao lado da partida. Você soma ou tira gols e assistências de cada jogador, e o resultado e o ranking acompanham. Foi tocado no jogador errado durante a partida? Use **Desfazer** no anotador; depois de encerrada, só em **Corrigir**.

### Partida aberta de outra semana

Se uma partida não foi encerrada na noite, ela aparece no topo de **Partidas** como "Partida de DD/MM ficou aberta". Ela só conta no ranking depois de encerrada: toque em **Abrir anotador** e depois em **Encerrar partida**.

## Cuidar dos jogadores

Tudo em **Jogadores**: toque no nome do jogador.

- **Zerar PIN:** para quem esqueceu o PIN. O PIN volta a ser 1234 e o jogador precisa criar outro no próximo acesso. O jogador sai de todos os aparelhos.
- **Desativar:** para quem parou de vir. Ele some da busca, das listas e de todos os aparelhos, mas o histórico fica guardado e o jogador volta ao ranking se for reativado (o ranking só lista quem está ativo). Para trazer de volta, marque **Mostrar inativos** e toque em **Reativar**.
- **Renomear:** mude o campo Nome e toque em **Salvar nome**. Não pode repetir o nome de outro jogador (maiúscula e minúscula contam como igual).
- Quem erra o PIN 5 vezes seguidas fica bloqueado por 15 minutos.
- **Trocar a sua senha de admin:** em **Admins > Trocar minha senha**. Este aparelho continua logado; os outros aparelhos do mesmo admin saem da conta.

## Se algo parecer travado

- **Primeiro, recarregue a página.** A lista e o anotador já se atualizam sozinhos a cada 5 segundos, então quase sempre basta esperar um pouco ou recarregar.
- **"Salvando há mais de 10 s — confira a conexão" no anotador:** o celular está sem internet boa. Os toques ficam guardados na fila e vão ao servidor na ordem. Não toque de novo no mesmo jogador: espere a conexão voltar (confira o Wi-Fi ou o 4G). Quando voltar, o aviso some e o placar confirma. Se o aviso não sumir, recarregue a página e confira o placar contra o que aconteceu em campo. Enquanto o aviso aparece, a faixa cobre o fim da lista: role a lista para alcançar o último jogador.
- **"Sem resposta do servidor":** a conexão caiu depois do toque, e o lance pode ter sido salvo. Não toque de novo: espere até 5 segundos, o placar se atualiza sozinho, e só toque se o lance realmente não apareceu.
- **"Não deu para desfazer":** outro admin anotou um lance depois do que você via. Nada foi apagado; confira o placar.
- **Saiu da conta sozinho:** acontece depois de trocar PIN ou senha em outro aparelho. Entre de novo.

## Backup

O banco fica no Neon. Ele guarda o histórico e permite voltar o banco para um momento anterior (restauração a qualquer ponto no tempo, dentro do período do plano). Se algo for apagado por engano, peça a quem cuida do site para restaurar no painel do Neon para um minuto antes do erro. Restaurar desfaz tudo o que foi feito depois desse ponto (listas, partidas, PINs), então avise o grupo.

## Publicar (Vercel + Neon)

Passo a passo para quem cuida do site (nada disto é preciso no dia a dia).

- **Regiões, perto de Recife:** crie o banco no Neon na região AWS `sa-east-1` (São Paulo) e deixe as funções da Vercel em `gru1` (também São Paulo). O `vercel.json` do projeto já fixa `"regions": ["gru1"]`.
- **Duas URLs do Neon:** o site usa a URL **com pool** (host terminado em `-pooler`) como `DATABASE_URL`. As migrações usam a URL **direta** (sem pool): `DATABASE_URL=$DATABASE_URL_UNPOOLED pnpm db:migrate`.
- **Variáveis de ambiente na Vercel:**
  - `DATABASE_URL`: a URL com pool.
  - `SESSION_SECRET`: texto com pelo menos 32 caracteres.
  - `ADMIN_USUARIO` e `ADMIN_SENHA`: só para criar o primeiro admin com `pnpm db:seed` (senha com 10 ou mais caracteres). Depois do primeiro acesso podem ser removidas.
- **Conferir num preview antes de abrir para o grupo:**
  1. Entrar como admin em `/admin/entrar`.
  2. Entrar como jogador com PIN 1234, ser levado a trocar o PIN e trocar.
  3. Confirmar a presença em `/lista`.
  4. Sorteio, marcar como definitivo, iniciar a partida, tocar GOL e Desfazer, encerrar.
  5. Abrir `/ranking`.
  6. Num iPhone, iniciar uma partida e ouvir o aviso sonoro dos 8:00 (o iOS é o mais exigente com som).
- **Backup:** a restauração a qualquer ponto no tempo do Neon só volta até onde o plano permite (a janela de retenção muda de plano para plano). Confira a janela do seu plano.

## Robô do WhatsApp

Um robô manda a lista no grupo **"Pelada 3.0"** sozinho: segunda às 14:00 avisa que a lista abriu, depois manda a lista de novo de meia em meia hora **só quando algo mudou**, lembra os mensalistas na quarta às 12:00 e avisa às 14:00 quando o prazo acabou. Das 23:00 às 08:00 fica quieto. Ele também **responde quando alguém marca o número dele** no grupo (veja "Robô responde quando é marcado", abaixo). Ele usa um número de WhatsApp sobrando, que já precisa estar no grupo, e roda no seu Mac.

Tudo dele fica no Mac, fora do projeto, na pasta `~/Library/Application Support/PeladaRobo/` (o login do WhatsApp, a última lista que ele mandou e o arquivo `.env` com o endereço do banco, a chave da IA e os números dos organizadores).

### 0. Pôr o projeto em `~/pelada`

O macOS não deixa um serviço que liga sozinho abrir pastas da Mesa (Desktop), Documentos, Downloads ou iCloud Drive. Por isso o robô precisa do projeto fora delas, em `~/pelada` (a pasta pessoal). Clone (ou mova) o projeto para lá e rode `pnpm install` dentro dele. Daqui para baixo, rode todos os comandos de dentro de `~/pelada`. Se você esquecer, o `pnpm robo:instalar` recusa e avisa.

### 1. Dizer onde está o banco

Crie o arquivo `~/Library/Application Support/PeladaRobo/.env` com uma linha só:

```
DATABASE_URL=<a mesma DATABASE_URL do site, copiada da Vercel>
```

Esse arquivo tem a senha do banco: não mande para ninguém e não coloque dentro da pasta do projeto. Depois de criar, proteja-o: `chmod 600 ~/Library/Application\ Support/PeladaRobo/.env`. Sem ele o robô não liga e avisa o que falta.

### 2. Conectar o número do robô (QR)

Na pasta do projeto, rode `pnpm robo:configurar`. Aparece um QR no Terminal. No celular do número sobrando, abra o WhatsApp > **Aparelhos conectados** > **Conectar um aparelho** e leia o QR. O robô procura o grupo "Pelada 3.0":

- achou um: guarda e diz "Pronto";
- achou dois com o mesmo nome: mostra os dois e pergunta qual é o certo (digite o número);
- não achou: o número do robô ainda não está no grupo (ou o nome está diferente). Adicione e rode de novo.

### 3. Testar num grupo de teste primeiro

Antes de valer no grupo de verdade, crie um grupo só com você e o número do robô (por exemplo, "Teste robô") e rode:

1. `pnpm robo:configurar --nome="Teste robô"` (escolhe o grupo de teste).
2. Para ver o que ele mandaria, sem mandar nada: `pnpm robo:ensaio`. Dá para simular um horário: `pnpm robo:ensaio --agora=2026-11-11T12:00:00-03:00`. O ensaio só lê o banco (nunca cria a lista da semana), então pode simular qualquer dia sem mexer no site.
3. Para mandar de verdade no grupo de teste: `pnpm robo` no Terminal, entre segunda 14:00 e quarta 20:30. A primeira mensagem sai na hora; feche com Ctrl+C.
4. Gostou? Rode `pnpm robo:configurar` de novo, sem `--nome`, para voltar ao "Pelada 3.0". Ao trocar de grupo o robô começa do zero, e a primeira mensagem no grupo de verdade é a lista completa.

### 4. Instalar (liga sozinho com o Mac)

Rode `pnpm robo:instalar`. Ele mostra **"Vai mandar em: …"** com o nome do grupo: confira que é o "Pelada 3.0" e não o grupo de teste (se for o de teste, rode `pnpm robo:desinstalar`, depois `pnpm robo:configurar` e instale de novo). A partir daí o robô liga sozinho quando você entra no Mac e fica conectado a semana toda, para responder quando for marcado. As mensagens automáticas continuam só de segunda 14:00 a quarta 20:30, e só nesse horário ele impede o Mac de dormir.

**Nos dias da pelada (segunda a quarta), deixe o Mac aberto e na tomada.** Com a tampa fechada o Mac dorme mesmo assim, e as mensagens atrasam. Quando o Mac volta, o robô manda uma mensagem só com tudo o que mudou (os horários fixos que passaram, como o lembrete das 12:00, não saem atrasados).

### Ver o que ele está fazendo

Ao ligar, o robô escreve no log em qual grupo vai mandar. Depois, entre segunda 14:00 e quarta 20:30, escreve uma linha por minuto no arquivo `~/Library/Logs/PeladaRobo/robo.log` (o que decidiu, o que mandou, erros). Fora desse horário fica quieto (uma linha avisando quando começa a próxima janela), a não ser quando responde a uma marcação ("respondeu a uma marcação …") ou deixa uma sem resposta ("marcação ignorada (motivo)"). Para acompanhar ao vivo: `tail -f ~/Library/Logs/PeladaRobo/robo.log`.

- **"Sessão do WhatsApp desconectada. Leia o QR de novo com `pnpm robo:configurar`."**: o WhatsApp desconectou o aparelho. Rode `pnpm robo:desinstalar`, depois `pnpm robo:configurar` (ele guarda o login antigo ao lado e mostra um QR novo) e `pnpm robo:instalar`. Nunca deixe dois programas conectados no número do robô ao mesmo tempo: o WhatsApp derruba a sessão.
- **"erro (tenta de novo na próxima volta)"**: faltou internet ou o banco não respondeu. Ele tenta sozinho no minuto seguinte; como a mensagem só é dada como enviada depois da confirmação do WhatsApp, um erro desse tipo não manda nada.
- **Log vazio depois de instalar**: confira se o projeto está mesmo em `~/pelada` (passo 0). Em último caso, `launchctl print gui/$(id -u)/com.pelada.robo` mostra o motivo da última parada.
- **"pode sair duplicada"**: o WhatsApp não confirmou a mensagem a tempo (internet ruim). O robô tenta de novo no minuto seguinte, então às vezes a mesma lista aparece duas vezes no grupo. É melhor do que perder a mensagem.

### Robô responde quando é marcado

Quando alguém marca o número do robô com @ no grupo configurado, ele responde. Em outro grupo ou no privado ele não responde. Ele responde a semana toda, **enquanto o Mac estiver ligado e acordado**, e fica calado das 23:00 às 08:00 (marcação nesse horário fica sem resposta, nem depois).

Comandos (escritos depois da marcação, com ou sem acento e maiúscula):

- `@robô lista` (ou só `@robô`): sempre a lista completa da semana. No começo vem o que mudou desde a última lista que ele mandou; se nada mudou, a primeira linha é "🔄 Status: sem nenhuma atualização.".
- `@robô falta confirmar` (ou `quem falta`): quem ainda não confirmou.
- `@robô fila`: a fila de espera.
- `@robô ajuda`: a lista de comandos.
- `@robô sortear`: só para os organizadores. Ele sorteia os times como o site, **sem salvar**, e mostra no grupo. Quem pediu responde `@robô sim` em até 10 minutos para marcar como definitivo (igual ao botão do site). Também vale **responder à mensagem dos times** (segurar a mensagem > Responder) escrevendo só `sim`, sem marcar o robô. Se errou, `@robô sortear de novo` faz outra proposta. Outra pessoa pedindo recebe "🔐 Só os organizadores podem sortear pelo WhatsApp.".
- Se um organizador receber "🔐 Só os organizadores podem sortear pelo WhatsApp.", pode ser que o WhatsApp esteja escondendo o número dele no grupo (o robô só vê um código no lugar do número). Avise o Marco.
- `@robô adicionar Nome` (também `adicionar lista Nome`): põe um jogador **já cadastrado** na lista, com as mesmas regras do botão "Entrar na fila" do site: com vaga entra direto na lista; lista cheia, vai para a fila (a resposta diz a posição); mensalista que tinha saído volta com a marca M. Responde, por exemplo, "✅ Pepe entrou na lista!" ou "📝 Pepe entrou na fila (2º).". Quem não está cadastrado recebe "🤔 Zé não está cadastrado. Peça para um admin cadastrar no site." (cadastrar continua sendo no site).
- `@robô confirmar Nome`: confirma quem está na lista principal, como o botão "Vou" (vale o prazo das 14h de quarta para os mensalistas). Quem está na fila só confirma quando subir para a lista.
- `@robô remover Nome`: tira da lista ou da fila, como o botão "Não vou". Não pede confirmação.
- **Vários nomes de uma vez:** `adicionar`, `confirmar` e `remover` aceitam até 3 nomes separados por vírgula e/ou " e " (`@robô adicionar Ana, Beto e Caio`, também `adicionar lista Ana e Beto`). Cada nome segue exatamente as regras de um nome só (mesmos textos, "(pedido por Nome)" em cada mudança) e as respostas saem numa única mensagem, uma por linha. Com mais de 3 nomes, só os 3 primeiros são feitos e a última linha diz "Só mudo até 3 nomes por mensagem.". O limite de 40 caracteres vale por nome. Não usa IA e não custa nada. Limitação conhecida: um nome que contém " e " (como "Maria e Silva") é dividido em dois; o "é" com acento não separa.
- **Nome parecido:** se o nome não for achado mas houver um único jogador com nome quase igual (até 2 letras de diferença, por exemplo "gabrel"), a resposta é `🤔 Não achei "gabrel". Você quis dizer Gabriel?`. Texto com menos de 5 letras só sugere com 1 letra de diferença, e um sobrenome sozinho pode sugerir o nome completo ("borjes" sugere "Mateus Borges"). O robô só sugere: não faz nada até a pessoa mandar o comando de novo com o nome certo.
- Nesses três, o nome pode ser só o começo ("ped" acha "Pedro") e não importa acento ou maiúscula. Se o começo servir para mais de um jogador, ele responde "🤔 Tem mais de um jogador com esse nome: Pedro e Pepe. Mande o nome inteiro.". Com a lista fechada ou a pelada cancelada, ele recusa com a mesma mensagem do site.
- **Qualquer pessoa do grupo** pode adicionar, confirmar e remover qualquer jogador. Para todo mundo ver quem mexeu, toda resposta que muda a lista termina com "(pedido por Nome)", com o nome que a pessoa usa no WhatsApp (nunca o telefone). A próxima lista automática também mostra a mudança no começo, como sempre.
- `@robô artilheiro`: os 3 que mais fizeram gols no mês (se o mês ainda não teve partida, no geral).
- `@robô garçom` (ou `garcom`): os 3 com mais assistências, com a mesma regra do mês.
- `@robô ranking`: os 5 primeiros em pontos, com a mesma regra do mês.
- `@robô times`: os times da pelada de hoje, se já foram definidos; senão "👕 Os times de hoje ainda não foram sorteados.".
- Qualquer outro texto é uma **pergunta livre**, respondida por uma IA (o Claude, da Anthropic). Ela consulta os dados do site (lista, fila, mensalistas, ranking, artilharia, partidas e times) e também entende pedidos escritos do jeito de cada um, como "@robô coloca o Pepe na lista", "@robô o Caio não vai mais" ou "@robô quem falta confirmar?". Para isso ela usa **exatamente os mesmos comandos de cima**, com as mesmas regras e as mesmas respostas: mudança na lista também termina com "(pedido por Nome)" de quem mandou a mensagem. Ela pode pedir o sorteio, mas só funciona para os organizadores (o robô confere o número de quem mandou, não o que a IA diz) e **a IA nunca confirma o sorteio**: a confirmação continua sendo o `sim` de quem pediu. Por mensagem, ela muda **no máximo 3 nomes** (passou disso, responde "Só mudo até 3 nomes por mensagem.") e pede **um sorteio só**. As respostas das mudanças, a lista e os times sorteados sempre saem no grupo exatamente como o robô escreve, mesmo que a IA tente resumir: os times mostrados são os mesmos que o `sim` salva. Ela não cadastra jogador, não mexe em placar e não muda nada além disso. Qualquer pessoa do grupo consegue fazer a IA repetir um texto qualquer. Com as perguntas livres desligadas, ele responde com a lista de comandos.

Ele responde na hora a cada marcação. Para não inundar o grupo, são no máximo **10 respostas por minuto**; passou disso, ele avisa uma vez "🙏 Muita gente me chamando agora. Mande de novo daqui a pouco." (no máximo um aviso por minuto) e as outras marcações desse minuto ficam sem resposta. O `sim` de quem pediu o sorteio é sempre respondido. Toda marcação que fica sem resposta deixa uma linha no log com o motivo, por exemplo "marcação ignorada (limite de 10 por minuto) de Pepe" ou "marcação ignorada (silêncio 23–08)".

Marcações feitas enquanto o Mac estava dormindo ou desligado, ou enquanto o robô reconectava, ficam sem resposta mesmo quando ele volta: é só marcar de novo.

**Ligar as perguntas livres e o sorteio.** Acrescente estas linhas ao arquivo `~/Library/Application Support/PeladaRobo/.env` (o mesmo do banco). Os valores abaixo são só exemplos; use os seus:

```
ANTHROPIC_API_KEY=sk-ant-exemplo123
ROBO_ADMINS=5581900000001,5581900000002,5581900000003
```

- `ANTHROPIC_API_KEY`: a chave que você cria no console da Anthropic (platform.claude.com > API Keys). Ela é como uma senha que gasta seu dinheiro: fica **só** nesse `.env` do robô. Não mande para ninguém e nunca coloque dentro da pasta do projeto.
- `ROBO_MODELO` (opcional): o modelo da IA. Sem essa linha, o robô usa o `claude-haiku-5-5`, o mais barato e rápido, que basta para o grupo. Só mude se souber o que está fazendo.
- `ROBO_ADMINS`: os números de quem pode sortear, com 55 e DDD, só números, separados por vírgula.
- `ROBO_CALVINHO` (opcional): o número do Jonas, no mesmo formato. Com ele, o robô reconhece o Jonas pelo número; sem ele, reconhece pelo primeiro nome do WhatsApp.

Se o seu `.env` ainda tem `OPENROUTER_API_KEY` e `OPENROUTER_MODEL`, de uma versão antiga, apague essas duas linhas: elas não valem mais.

Depois de mudar o `.env`, reinicie o robô: `pnpm robo:desinstalar` e `pnpm robo:instalar`. Ao ligar, o log mostra "Respostas: IA ligada (claude-haiku-5-5); 3 admin(s) para sortear." ou "Respostas: IA desligada; …" quando não há chave.

**Custo e limite.** Comandos e sorteio pelo comando não usam IA e não custam nada. Cada pergunta livre é cobrada pela Anthropic no cartão cadastrado no console, e custa **uma fração de centavo** (com o `claude-haiku-5-5`, algo perto de US$ 0,001 por mensagem, ou seja, uns 0,5 centavo de real). Para o gasto não fugir do controle, são no máximo **30 perguntas livres por dia**; passou disso, ele responde "Por hoje acabaram as perguntas livres. Os comandos continuam: lista, falta confirmar, fila.". Esse contador volta a zero quando o robô reinicia, então **ponha também um limite de gasto no console da Anthropic** (em platform.claude.com, na página de limites de gasto, por exemplo US$ 5 por mês). Passou do limite, a Anthropic recusa e o robô responde "😕 Não consegui responder agora.". A mesma resposta aparece se a IA demorar mais de 30 segundos ou der qualquer erro; os comandos continuam funcionando.

**Desligar as perguntas livres.** Apague a linha `ANTHROPIC_API_KEY` do `.env` e reinicie o robô. Os comandos e o sorteio continuam; um texto que não é comando passa a receber a lista de comandos.

### Atualizar o robô

Quando o site ganhar regras novas, o robô continua com as antigas até você atualizá-lo. No Terminal, rode (um comando por vez):

1. `cd ~/pelada`
2. `git pull` (baixa a versão nova) e `pnpm install`
3. `pnpm robo:desinstalar` e depois `pnpm robo:instalar` (reinicia o robô com o código novo). Confira o "Vai mandar em: …" que aparece.

Faça isso fora de segunda 14:00 → quarta 20:30, se puder. O login do WhatsApp e o estado não se perdem.

### Desligar

`pnpm robo:desinstalar` desliga o robô e tira do início do Mac. Para voltar, `pnpm robo:instalar`. Não rode `pnpm robo:configurar` com o robô instalado: são duas conexões no mesmo número e uma derruba a outra. Desinstale antes.
