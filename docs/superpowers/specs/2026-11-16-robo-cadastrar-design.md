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

- Sem nota: 3,0, como no site. Vários nomes antes de uma nota ("Caio, Pedro e João - 2.5") dividem a nota.
- "Caio Pedro" sem vírgula é um nome só (nomes compostos como "Mateus Borges").
- Nome todo em minúsculas ganha iniciais maiúsculas ("joão da silva" → "João da Silva").
- Até 10 pessoas por mensagem; o resto é avisado.
- Nome já cadastrado (sem diferenciar acento, até inativo), nota inválida ou nome com mais de 60 letras:
  não cadastra e diz o motivo; os outros da mesma mensagem seguem.
- A resposta mostra os nomes com a nota e "(pedido por <nome do WhatsApp>)". O PIN não aparece no grupo.
- Cadastrar não põe ninguém na lista (para isso, `adicionar`). A IA nunca cadastra só porque o
  `adicionar` disse que a pessoa não está cadastrada.
