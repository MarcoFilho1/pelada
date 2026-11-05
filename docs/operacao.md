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
- **Desativar:** para quem parou de vir. Ele some da busca, das listas e de todos os aparelhos, mas o histórico e o ranking ficam. Para trazer de volta, marque **Mostrar inativos** e toque em **Reativar**.
- **Renomear:** mude o campo Nome e toque em **Salvar nome**. Não pode repetir o nome de outro jogador (maiúscula e minúscula contam como igual).
- Quem erra o PIN 5 vezes seguidas fica bloqueado por 15 minutos.
- **Trocar a sua senha de admin:** em **Admins > Trocar minha senha**. Este aparelho continua logado; os outros aparelhos do mesmo admin saem da conta.

## Se algo parecer travado

- **Primeiro, recarregue a página.** A lista e o anotador já se atualizam sozinhos a cada 5 segundos, então quase sempre basta esperar um pouco ou recarregar.
- **"Salvando há mais de 10 s — confira a conexão" no anotador:** o celular está sem internet boa. Os toques ficam guardados na fila e vão ao servidor na ordem. Não toque de novo no mesmo jogador: espere a conexão voltar (confira o Wi-Fi ou o 4G). Quando voltar, o aviso some e o placar confirma. Se o aviso não sumir, recarregue a página e confira o placar contra o que aconteceu em campo. Enquanto o aviso aparece, a faixa cobre o fim da lista: role a lista para alcançar o último jogador.
- **"Não deu para desfazer":** outro admin anotou um lance depois do que você via. Nada foi apagado; confira o placar.
- **Saiu da conta sozinho:** acontece depois de trocar PIN ou senha em outro aparelho. Entre de novo.

## Backup

O banco fica no Neon. Ele guarda o histórico e permite voltar o banco para um momento anterior (restauração a qualquer ponto no tempo, dentro do período do plano). Se algo for apagado por engano, peça a quem cuida do site para restaurar no painel do Neon para um minuto antes do erro. Restaurar desfaz tudo o que foi feito depois desse ponto (listas, partidas, PINs), então avise o grupo.
