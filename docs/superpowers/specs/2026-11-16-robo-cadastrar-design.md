# Robô: cadastrar jogadores novos pelo WhatsApp — desenho curto

Adendo a `2026-11-11-robo-comandos-lista-design.md`. Pedido do usuário em 16/11/2026: abrir o site para
cadastrar gente nova é chato; o robô deve cadastrar pelo grupo.

## O que faz

- `@robô cadastrar Caio - 2.5` ou `2,5` (ponto ou vírgula). Várias pessoas numa mensagem, separadas por
  espaço depois da nota, vírgula, ";", " e " ou linha: `cadastrar Caio - 2.5 Joao - 2.5 Pedro - 2,5`.
- Em linguagem natural, pela IA: `@robô adicione as pessoas caio, pedro e joao, as notas são 2.5 pra todos`
  → ferramenta `cadastrar_jogadores`, que passa pelo mesmo caminho do comando escrito.
- **Só os organizadores** (os mesmos `ROBO_ADMINS` do sorteio, pelo telefone; decisão do usuário).
  Remetente que só aparece como LID não é reconhecido, como no sorteio.
- Cadastro igual ao do site: PIN padrão (troca obrigatória), ativo; nota de 0 a 5 de 0,5 em 0,5.

## Decisões do Claude (o usuário pode mudar)

- Sem nota (pedido do usuário): ninguém sem nota é cadastrado; o robô pede a nota de quem veio sem ela
  ("✍️ Faltou a nota de Pedro e João…") e cadastra os outros. Vários nomes antes de uma nota ("Caio, Pedro e João - 2.5") dividem a nota.
- "Caio Pedro" sem vírgula é um nome só (nomes compostos como "Mateus Borges").
- Nome todo em minúsculas ganha iniciais maiúsculas ("joão da silva" → "João da Silva").
- Até 10 pessoas por mensagem; o resto é avisado.
- Nome já cadastrado (sem diferenciar acento, até inativo), nota inválida ou nome com mais de 60 letras:
  não cadastra e diz o motivo; os outros da mesma mensagem seguem.
- A resposta mostra os nomes com a nota e "(pedido por <nome do WhatsApp>)". O PIN não aparece no grupo.
- Cadastrar não põe ninguém na lista (para isso, `adicionar`). A IA nunca cadastra só porque o
  `adicionar` disse que a pessoa não está cadastrada.

## Ajustes do mesmo dia (pedidos do usuário)

- **Lista depois de entrar ou confirmar:** o pessoal confirmava e logo pedia a lista para conferir. Agora,
  quando `adicionar` ou `confirmar` muda algo (comando ou IA), a resposta traz a lista atual no formato do
  "Copiar lista", uma vez só por mensagem. `remover` não traz (decisão do Claude).
- **Apelido por número (`ROBO_APELIDOS` no `.env`):** "número=Nome no site". O dono aparece no WhatsApp como
  "Marco Filho", mas no site é "Marquinho"; "@robô eu vou" falhava. A IA recebe o nome do site de quem fala, e
  "confirmar eu"/"adicionar eu"/"remover eu" usam esse nome (sem apelido, o nome do WhatsApp).
- **Mensagens revisadas:** "admin" virou "organizador" no que vai ao grupo; consultas vazias ganharam emoji;
  o aviso de jogador não cadastrado ensina o `cadastrar`; os avisos de limite dizem o que fazer.
- **Calvinho em todos os comandos do Jonas:** variantes novas para cada comando, inclusive `adicionar`,
  `confirmar`, `remover` (quando ele mexe em outra pessoa), `cadastrar`, `sortear` e o `sim`. Erros seguem sérios.
