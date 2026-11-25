# Robô no Android

O robô pode rodar num celular Android, em segundo plano, dentro de um app que leva também o
ZapGate. O app tem repositório próprio:
[pelada-android](https://github.com/MarcoFilho1/pelada-android). Lá está como ele funciona, as
telas e como montar e instalar.

Aqui fica o que é **do robô e do site**:

| O quê | Onde |
| --- | --- |
| Empacotar o robô num arquivo só | `scripts/compilar-robo-android.mjs` |
| Pacote de ensaio (sem WhatsApp e sem o banco de verdade) | `scripts/android/montar-pacote-ensaio.mts` |
| Pacote de verdade, a partir da configuração do Mac | `scripts/android/montar-pacote.mjs` |
| Publicar uma atualização assinada | `scripts/android/publicar-robo.mjs` |
| Receber o sinal de vida do celular | `/api/robo/sinal` no site |
| Ser avisado no Mac quando o celular some | `scripts/android/vigiar-sinal.mjs` |

O banco (Neon) e a IA (Anthropic) continuam na nuvem; o que vai para o celular é a conexão com o
WhatsApp e a lógica do robô.

## O robô empacotado

```sh
node scripts/compilar-robo-android.mjs      # sai dist/android/robo.mjs e versao.json
```

No celular não há `node_modules`, então as dependências vão dentro do arquivo. Ficam de fora a
Baileys (lá o robô só fala com o WhatsApp pelo ZapGate) e o PGlite (banco de ensaio, carregado
só se o pacote de ensaio trouxer). A versão vem do último commit: o número é a data do commit, e
é por ele que o app decide se uma atualização é mais nova.

No código do robô a única diferença é que o `caffeinate` (manter o Mac acordado) só é chamado no
Mac; no celular quem faz isso é o app.

## Ensaio

O pacote de ensaio usa o **motor simulado** do ZapGate (nada chega ao WhatsApp) e um **banco de
mentira** com jogadores de nomes inventados:

```sh
pnpm tsx scripts/android/montar-pacote-ensaio.mts                                   # só comandos
ANTHROPIC_API_KEY=... pnpm tsx scripts/android/montar-pacote-ensaio.mts --com-ia    # com a IA (gasta crédito)
```

Sai em `dist/android/pacote-ensaio.zip`. No app aparece a aba **Ensaio**, uma conversa de mentira
com o robô, no grupo ou no privado.

## Atualização

O app consulta um arquivo pequeno, o *manifesto*, de 6 em 6 horas e, havendo versão mais nova do
robô, baixa, confere, troca e reinicia só o robô. Se a versão nova não ficar de pé em 3 minutos,
ele volta para a anterior.

Cada versão é **assinada** aqui, com uma chave privada que nunca sai do computador. O app só tem
a chave pública. Por isso o lugar onde os arquivos ficam hospedados não precisa ser de confiança.

```sh
node scripts/android/publicar-robo.mjs chave    # uma vez: cria a chave e mostra a pública
node scripts/android/publicar-robo.mjs          # empacota, assina e gera dist/android/publicar/
```

**Onde ficam os arquivos.** O manifesto fica no próprio site (`/api/robo/atualizacao`, tabela
`robo_manifesto`, migração `0009`); os arquivos (o robô e, quando há, o APK) ficam no
armazenamento de arquivos da Vercel (Blob), cada um num endereço com um sufixo sorteado que só
aparece dentro do manifesto.

- `GET /api/robo/atualizacao`: o app pergunta se há versão nova. Pede `ROBO_ATUALIZACAO_CHAVE`,
  que vai no pacote do aparelho (`atualizacao_token`) e só lê.
- `PUT /api/robo/atualizacao`: publica um manifesto. Pede `ROBO_PUBLICAR_CHAVE`, que fica só com
  quem publica.

São duas chaves de propósito. E nenhuma delas basta para mandar código ao robô: isso exige a
chave de assinatura, que o site nunca vê.

```sh
node scripts/android/publicar-robo.mjs --subir   # empacota, assina, manda os arquivos e publica
```

`--subir` lê `ROBO_ATUALIZACAO_URL` e `ROBO_PUBLICAR_CHAVE` do ambiente ou de
`~/Library/Application Support/PeladaRobo/android-publicar.env`, e precisa rodar numa pasta ligada
ao projeto na Vercel.

Para incluir uma versão nova do próprio app:
`publicar-robo.mjs --subir --app=caminho.apk --app-versao=0.2.0 --app-numero=2`. O app baixa o
APK sozinho e mostra o botão de instalar; o Android sempre pede a confirmação de quem está com o
aparelho (instalar em silêncio não é permitido a apps comuns).

## Sinal de vida

De minuto em minuto, com o robô ligado, o app conta ao site como está: estado da conta do
WhatsApp, se o robô está rodando, quedas, versões, bateria e as últimas linhas que o próprio app
escreveu (ligou, caiu, atualizou). **Nunca** vai conversa, nome nem número de ninguém.

**No site** (`/api/robo/sinal`, tabela `robo_sinais`, migração `0008`):

- `POST`: o app manda o sinal.
- `GET`: responde `200` se está tudo certo e `503` com a frase do problema quando o celular sumiu
  (sem sinal há mais de 5 minutos), o WhatsApp desconectou ou o robô parou.
- As duas pedem a chave `ROBO_SINAL_CHAVE` (24+ caracteres) em `Authorization: Bearer`. Sem essa
  variável no site, a rota recusa todo mundo.

**Para ser avisado**, no Mac:

```sh
ROBO_SINAL_URL=https://<site>/api/robo/sinal ROBO_SINAL_CHAVE=<a chave> node scripts/android/vigiar-sinal.mjs
ROBO_SINAL_URL=… ROBO_SINAL_CHAVE=… node scripts/android/vigiar-sinal.mjs --uma-vez   # só olha agora
```

O vigia pergunta de 2 em 2 minutos e mostra uma notificação do macOS quando aparece um problema e
quando volta ao normal. Ele só avisa com o Mac ligado: para ser avisado sempre, dá para apontar
um serviço de monitoramento (com aviso por e-mail ou Telegram) para o mesmo endereço.

Por que o aviso não chega pelo WhatsApp do robô: o número do robô está no celular que sumiu.

**Para pôr no ar:** rodar a migração `0008` no banco, criar `ROBO_SINAL_CHAVE` na Vercel e
publicar o site.

## Mudar o robô do Mac para o celular

O pacote de verdade é montado a partir do que o robô usa hoje no Mac:

```sh
node scripts/android/montar-pacote.mjs --com-sessao \
  --sinal-url=https://<site>/api/robo/sinal --sinal-chave=<a chave> --aparelho="celular do Fulano" \
  --atualizacao-url=https://…/manifesto.json --atualizacao-chave=<a pública>
```

Ele copia as regras do ZapGate e a configuração do robô como estão (conta, limites, grupos,
organizadores, Pix, horários) e muda só o necessário: caminhos, e as chaves entre o robô e o
ZapGate, que são criadas novas para o celular. As opções de sinal e de atualização são opcionais.

**Com `--com-sessao`** a sessão do WhatsApp vai junto: para o WhatsApp continua sendo o mesmo
aparelho conectado, então não precisa parear de novo. **Sem** ela, o celular pareia pelo código
de 8 letras na tela Conectar.

A ordem, no dia:

1. No Mac, desligar o robô e o ZapGate, e não ligar mais nessa conta:
   `launchctl bootout gui/$(id -u)/com.pelada.robo` e `launchctl bootout gui/$(id -u)/zapgate`.
2. Montar o pacote (comando acima) e mandar o `dist/android/pacote.zip` direto para o aparelho.
3. No app: **Importar pacote**, permitir bateria e notificação, **Ligar**.
4. Conferir no Início que aparece "WhatsApp conectado" e, no Mac, `vigiar-sinal.mjs --uma-vez`.
5. Apagar o pacote do computador e do aparelho (ele leva a chave do banco e a da IA).

Nunca os dois ligados na mesma conta: foi o que derrubou a sessão em 10/11.

**Para voltar ao Mac:** desligar o robô no app e **parear de novo no Mac** (`zapgate pair pelada`).
Se a sessão foi para o celular, a cópia que ficou no Mac está desatualizada (as chaves da conversa
avançam a cada mensagem) e não deve ser religada.

## O que não vai para o celular

- **A auto-revisão (`claude -p`)** continua no Mac. Com o robô no celular, o "pode mergear" pelo
  privado deixa de funcionar, porque quem roda o script de merge é o Mac.
