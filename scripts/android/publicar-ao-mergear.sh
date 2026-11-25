#!/bin/zsh
# Publica a atualização do robô do celular quando a `main` muda. Roda de 5 em 5 minutos por um
# serviço do Mac (scripts/android/instalar-publicador.sh), numa cópia do repositório só para isso.
#
# A cada volta: busca a `main`; se ela mudou desde a última publicação E a mudança mexe no robô,
# instala as dependências, empacota, assina com a chave que só existe neste Mac e publica.
# Mudança que não mexe no robô (só o site, só documentação) é só anotada, sem publicar.
# Se algo falhar, a mesma versão é tentada de novo na volta seguinte.
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
cd "$(dirname "$0")/../.."

MARCA="$HOME/Library/Application Support/PeladaRobo/android-publicado.txt"
hora() { date "+%Y-%m-%d %H:%M"; }
avisar() { osascript -e "display notification \"$2\" with title \"$1\"" >/dev/null 2>&1 || true; }

git fetch -q origin main || { echo "$(hora) não consegui buscar a main (sem internet?)"; exit 0; }
NOVA=$(git rev-parse origin/main)
ANTIGA=$(cat "$MARCA" 2>/dev/null || echo "")
[ "$NOVA" = "$ANTIGA" ] && exit 0

# O que mexe no robô: o código, as dependências e o próprio empacotamento.
if [ -n "$ANTIGA" ] && git cat-file -e "$ANTIGA" 2>/dev/null; then
  if git diff --quiet "$ANTIGA" "$NOVA" -- src package.json pnpm-lock.yaml scripts/compilar-robo-android.mjs scripts/android; then
    echo "$(hora) main em ${NOVA:0:7}: nada que mexa no robô; não publica"
    echo "$NOVA" > "$MARCA"
    exit 0
  fi
fi

echo "$(hora) main em ${NOVA:0:7}: publicando"
git checkout -q --detach "$NOVA" || { echo "$(hora) não consegui ir para ${NOVA:0:7}"; exit 1; }
pnpm install --frozen-lockfile --prefer-offline >/dev/null 2>&1 || { echo "$(hora) pnpm install falhou"; avisar "Robô da Pelada" "A atualização ${NOVA:0:7} não foi publicada: as dependências não instalaram."; exit 1; }
if SAIDA=$(node scripts/android/publicar-robo.mjs --subir 2>&1); then
  echo "$NOVA" > "$MARCA"
  VERSAO=$(echo "$SAIDA" | sed -n 's/.*pronto em .*: robô \([^,]*\).*/\1/p' | tail -1)
  echo "$(hora) publicado: robô ${VERSAO:-${NOVA:0:7}}"
  avisar "Robô da Pelada" "Atualização ${VERSAO:-${NOVA:0:7}} publicada. O celular pega em até 6 horas."
else
  echo "$(hora) a publicação falhou:"
  echo "$SAIDA" | tail -5
  avisar "Robô da Pelada" "A atualização ${NOVA:0:7} não foi publicada. Veja ~/Library/Logs/PeladaRobo/publicar.log"
  exit 1
fi
