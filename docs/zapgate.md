# Robô pelo ZapGate

O robô pode falar com o WhatsApp pelo [ZapGate](https://github.com/MarcoFilho1/zapgate) em vez
da Baileys. O ZapGate roda à parte (serviço próprio no Mac), mantém a conexão e passa **todo
envio** pelas regras anti-ban:

- só responde a quem escreveu; só puxa conversa com quem está liberado (o grupo e os
  organizadores);
- limites por hora e por dia, com aquecimento de duas semanas;
- horário de silêncio, "SAIR";
- mensagens que chegaram atrasadas nunca são respondidas automaticamente;
- outros robôs são ignorados, e uma conversa que responde rápido demais, várias vezes seguidas,
  é pausada (freio de laço);
- modo cauteloso quando aparecem sinais de risco;
- **jeito humano**: lê, pensa, mostra "digitando…" pelo tempo que uma pessoa levaria, quebra
  respostas longas em partes e tira o ponto final (pontuação casual).

O robô recebe as mensagens por um webhook local assinado e manda pela API do ZapGate. Tudo isso
se ajusta no **painel do ZapGate** (`http://127.0.0.1:8787/panel/`).

Nada muda no resto do robô: `src/robo/whatsapp-zapgate.ts` cumpre a mesma interface `WhatsApp`
de `src/robo/whatsapp.ts`. Sem `ROBO_MOTOR=zapgate`, tudo continua na Baileys.

> **Nunca deixe a Baileys e o ZapGate ligados no mesmo número.**

## 1. ZapGate

O ZapGate precisa de três coisas a mais no `zapgate.toml` para o robô: um webhook que aponta
para o robô, uma chave com permissão de envio para o robô, e o grupo e os organizadores
liberados.

```toml
[[sessions]]
id = "pelada"
expected_number = "55XXXXXXXXXXX"         # o número do robô

[sessions.gate]
# Quem o robô pode chamar primeiro: o grupo (lista, lembretes) e o privado dos organizadores.
# O id do grupo está em ~/Library/Application Support/PeladaRobo/estado.json (grupoId),
# depois do `pnpm robo:configurar` (ou na tela Conversas do painel).
allow_initiate = ["1203630000000000000@g.us", "55XXXXXXXXXXX"]
groups = "listed"                         # lê só os grupos escolhidos
read_groups = ["1203630000000000000@g.us"]

[sessions.webhook]
url = "http://127.0.0.1:8788/"
secret_env = "PELADA_WEBHOOK_SECRET"

[[api.keys]]
name = "robo-pelada"
key_env = "PELADA_ROBO_KEY"
scopes = ["read", "send"]
sessions = ["pelada"]
# Durante os testes, prenda o robô a conversas seguras:
# allow_to = ["<grupo de teste>@g.us", "55XXXXXXXXXXX"]
```

Gere os segredos com `openssl rand -hex 24`. O envio começa **desligado**; ligue no painel
(Regras › Envio) quando o número estiver pronto. O aquecimento começa aí.

## 2. Robô

No `.env` do robô (`~/Library/Application Support/PeladaRobo/.env`), além do que já existe:

```
ROBO_MOTOR=zapgate
ZAPGATE_URL=http://127.0.0.1:8787
ZAPGATE_KEY=<o mesmo valor de PELADA_ROBO_KEY>
ZAPGATE_WEBHOOK_SECRET=<o mesmo valor de PELADA_WEBHOOK_SECRET>
# opcionais: ZAPGATE_SESSAO=pelada, ZAPGATE_WEBHOOK_PORTA=8788
```

`pnpm robo:configurar` agora só escolhe o grupo (o pareamento é do ZapGate: painel ou
`zapgate pair pelada --qr`), e `pnpm robo` roda como antes.

## O que muda no comportamento

- **Respostas** saem com leitura, "digitando…" e, se forem longas, em partes. Uma resposta pode
  levar de alguns segundos a um minuto; o robô espera até 3 minutos pela confirmação.
- **Recusas do ZapGate** aparecem no log do robô com o motivo, por exemplo
  `ZapGate recusou (not_a_reply): a conversa não escreveu antes e não está em allow_initiate`.
  Nada sai nesses casos. O painel mostra as mesmas recusas no Registro.
- **Mensagens atrasadas** (que chegam mais de 10 minutos depois de enviadas, por exemplo depois de
  uma reconexão) são ignoradas: um "anotar"/"sai" antigo não mexe na lista agora.
- **O mesmo texto** para a mesma conversa em menos de 2 minutos é recusado pelo ZapGate; repetir
  depois disso, ou para outra conversa, é normal.
- **Numa queda curta**, um envio espera o ZapGate reconectar por até 1 minuto e tenta mais uma
  vez, como a Baileys fazia.
- **Avisos aos organizadores** vão sempre para o telefone deles (é o que está liberado).
- **Se a sessão parar** (número errado, deslogado, banido), o robô para com a explicação.

## Limites a ter em mente

- **Aquecimento:** nos primeiros 3 dias depois de ligar o envio, 25 % dos limites; 50 % até o
  7º dia, 75 % até o 14º. O painel mostra o dia e quanto já foi usado. Numa quarta movimentada
  isso pode recusar respostas (`hourly_limit`).
- **Horário de silêncio (22:00-07:00):** só bloqueia *puxar conversa*. Responder quem escreveu
  continua valendo a qualquer hora.

## Testes

`tests/robo/whatsapp-zapgate.test.ts` cobre a tradução dos eventos. Se o binário do ZapGate
existir (`ZAPGATE_BIN` ou `~/Desktop/things/motor-wa/target/debug/zapgate`), cobre também o
caminho completo com o ZapGate no **WhatsApp falso**: nada chega ao WhatsApp e nenhum contato
recebe nada.
