#!/bin/bash
# Deixa pronto tudo o que o app leva dentro e que não é código Kotlin:
#   1. o Node para Android e suas bibliotecas   (scripts/baixar-node.sh)
#   2. o ZapGate compilado para Android          (scripts/compilar-zapgate.sh)
#   3. o robô num arquivo só                     (scripts/compilar-robo-android.mjs, na raiz)
# Depois é só `./gradlew :app:assembleDebug`.
#
# Uso: ZAPGATE_DIR=/caminho/do/zapgate android/scripts/preparar.sh
#      (sem ZAPGATE_DIR, reaproveita o ZapGate já compilado, se houver)
set -euo pipefail
cd "$(dirname "$0")/.."

scripts/baixar-node.sh
if [ -n "${ZAPGATE_DIR:-}" ]; then
  scripts/compilar-zapgate.sh
elif [ ! -f app/src/main/jniLibs/arm64-v8a/libzapgate.so ]; then
  echo "ERRO: falta o ZapGate. Rode de novo com ZAPGATE_DIR=/caminho/do/zapgate" >&2
  exit 1
fi
(cd .. && node scripts/compilar-robo-android.mjs)
rm -rf app/src/main/assets/robo
mkdir -p app/src/main/assets/robo
cp ../dist/android/robo.mjs ../dist/android/versao.json app/src/main/assets/robo/
echo "pronto. Agora: ./gradlew :app:assembleDebug"
