# Robô pelo motor-wa

O robô pode falar com o WhatsApp pelo [motor-wa](https://github.com/MarcoFilho1/motor-wa) em vez
da Baileys. O motor-wa roda à parte (serviço próprio no Mac), mantém a conexão e passa **todo
envio** pelas regras anti-ban:

- só responde a quem escreveu;
- só puxa conversa com quem está em `allow_initiate` (o grupo e os organizadores);
- limites por hora e por dia, com aquecimento de duas semanas;
- horário de silêncio, "SAIR";
- mensagens que chegaram atrasadas nunca são respondidas automaticamente;
- modo cauteloso quando aparecem sinais de risco.

O robô recebe as mensagens por um webhook local assinado e manda pela API do motor-wa.

Nada muda no resto do robô: `src/robo/whatsapp-motor.ts` cumpre a mesma interface `WhatsApp`
de `src/robo/whatsapp.ts`. Sem `ROBO_MOTOR=motor-wa`, tudo continua na Baileys.

> **Nunca deixe a Baileys e o motor-wa ligados no mesmo número.**

## 1. motor-wa

Pasta fora de Desktop/Documentos/Downloads (o macOS não deixa serviços lerem lá), por exemplo
`~/motor-wa/motor-wa.toml`:

```toml
keep_awake = true                         # o Mac não dorme enquanto o motor-wa roda

[[sessions]]
id = "pelada"
expected_number = "55XXXXXXXXXXX"         # o número do robô

[sessions.gate]
# Quem o robô pode chamar primeiro: o grupo (lista, lembretes) e o privado dos organizadores.
# O id do grupo está em ~/Library/Application Support/PeladaRobo/estado.json (grupoId),
# depois do `pnpm robo:configurar`.
allow_initiate = [
  "1203630000000000000@g.us",
  "55XXXXXXXXXXX",                        # cada número de ROBO_ADMINS
]
utc_offset = "-03:00"
# quiet_hours = "22:00-07:00"             # padrão; lembretes noturnos ficam para de manhã

[sessions.webhook]
url = "http://127.0.0.1:8788/"
secret_env = "PELADA_WEBHOOK_SECRET"

[api]
listen = "127.0.0.1:8787"

[[api.keys]]
name = "robo-pelada"
key_env = "PELADA_MOTOR_KEY"
scopes = ["read", "send"]
sessions = ["pelada"]

[[api.keys]]
name = "admin"
key_env = "MOTOR_WA_ADMIN_KEY"
scopes = ["read", "admin"]
```

```sh
export PELADA_WEBHOOK_SECRET=$(openssl rand -hex 24)
export PELADA_MOTOR_KEY=$(openssl rand -hex 24)
export MOTOR_WA_ADMIN_KEY=$(openssl rand -hex 24)
./motor-wa check-config
./motor-wa pair pelada                    # código de 8 letras para digitar no celular do robô
./motor-wa service install                # sobe agora e a cada login
```

Os segredos precisam estar exportados no terminal na hora do `service install`: o launchd não
vê o seu terminal, então eles vão para o arquivo do serviço (criado legível só por você).

O envio começa **desligado**. Ligue só quando o número estiver pronto (o aquecimento começa aí):

```sh
./motor-wa service uninstall && ./motor-wa sending pelada on && ./motor-wa service install
# ou, com o motor-wa rodando:
curl -X PUT -H "Authorization: Bearer $MOTOR_WA_ADMIN_KEY" -H 'Content-Type: application/json' \
  -d '{"enabled":true}' http://127.0.0.1:8787/v1/sessions/pelada/sending
```

## 2. Robô

No `.env` do robô (`~/Library/Application Support/PeladaRobo/.env`), além do que já existe:

```
ROBO_MOTOR=motor-wa
MOTOR_WA_URL=http://127.0.0.1:8787
MOTOR_WA_KEY=<o mesmo valor de PELADA_MOTOR_KEY>
MOTOR_WA_WEBHOOK_SECRET=<o mesmo valor de PELADA_WEBHOOK_SECRET>
# opcionais: MOTOR_WA_SESSAO=pelada, MOTOR_WA_WEBHOOK_PORTA=8788
```

`pnpm robo:configurar` agora só escolhe o grupo (o pareamento é do motor-wa), e `pnpm robo`
roda como antes.

## O que muda no comportamento

- **Respostas** saem com uma pausa sorteada de 2 a 6 s entre mensagens. O "digitando…" à parte
  deixa de existir.
- **Recusas do motor-wa** aparecem no log do robô com o motivo, por exemplo
  `motor-wa recusou (not_a_reply): a conversa não escreveu antes e não está em allow_initiate`.
  Nada sai nesses casos.
- **Mensagens atrasadas** (que chegam mais de 10 minutos depois de enviadas, por exemplo depois de
  uma reconexão) são ignoradas: um "anotar"/"sai" antigo não mexe na lista agora. Fica no log.
- **O mesmo texto** para a mesma conversa em menos de 2 minutos é recusado pelo motor-wa (com
  erro no log); repetir depois disso, ou para outra conversa, é normal.
- **Numa queda curta**, um envio espera o motor-wa reconectar por até 1 minuto e tenta mais uma
  vez, como a Baileys fazia.
- **Avisos aos organizadores** vão sempre para o telefone deles (é o que está em
  `allow_initiate`).
- **Se a sessão parar** (número errado, deslogado, banido), o robô para com a explicação.

## Limites a ter em mente

- **Aquecimento:** nos primeiros 3 dias depois de ligar o envio, o motor-wa permite 25 % dos
  limites (15 mensagens/hora, 100/dia, 3 respostas/hora a conversas novas); 50 % até o 7º dia,
  75 % até o 14º. Numa quarta movimentada isso pode recusar respostas (`hourly_limit`). Para um
  número que já é usado há tempo, dá para desligar com `warmup = false` em `[sessions.gate]`.
- **Horário de silêncio (22:00-07:00):** só bloqueia *puxar conversa*. Se o grupo ficou mais de
  24 h sem escrever, um lembrete às 22:30 é recusado até de manhã. Responder quem escreveu
  continua valendo a qualquer hora.

## Testes

`tests/robo/whatsapp-motor.test.ts` cobre a tradução dos eventos. Se o binário do motor-wa
existir (`MOTOR_WA_BIN` ou `~/Desktop/things/motor-wa/target/debug/motor-wa`), cobre também o
caminho completo com o motor-wa no **WhatsApp falso**: nada chega ao WhatsApp e nenhum contato
recebe nada.
