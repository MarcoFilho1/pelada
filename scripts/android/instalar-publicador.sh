#!/bin/zsh
# Instala (ou tira) o serviço do Mac que publica a atualização do robô do celular a cada mudança
# na `main`. Rode de dentro de uma cópia do repositório FORA da Mesa e de Documentos (o macOS não
# deixa serviços lerem essas pastas), por exemplo ~/pelada-publicar:
#
#   git clone <repositório> ~/pelada-publicar && cd ~/pelada-publicar
#   scripts/android/instalar-publicador.sh            instala e já roda a primeira volta
#   scripts/android/instalar-publicador.sh tirar      desinstala
#
# Antes, precisam existir em ~/Library/Application Support/PeladaRobo/:
#   android-atualizacao.pem   a chave de assinatura (publicar-robo.mjs chave)
#   android-publicar.env      ROBO_ATUALIZACAO_URL, ROBO_PUBLICAR_CHAVE e BLOB_READ_WRITE_TOKEN
set -eu
ROTULO=com.pelada.publicar
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"
AQUI="$(cd "$(dirname "$0")/../.." && pwd)"
ALVO="gui/$(id -u)"

launchctl bootout "$ALVO/$ROTULO" 2>/dev/null || true
if [ "${1:-}" = "tirar" ]; then
  rm -f "$PLIST"
  echo "serviço $ROTULO tirado"
  exit 0
fi

case "$AQUI" in
  "$HOME/Desktop"/*|"$HOME/Documents"/*|"$HOME/Downloads"/*)
    echo "ERRO: $AQUI fica numa pasta que o macOS não deixa serviços lerem. Clone o repositório em outro lugar (ex.: ~/pelada-publicar)." >&2
    exit 1 ;;
esac
DADOS="$HOME/Library/Application Support/PeladaRobo"
for f in android-atualizacao.pem android-publicar.env; do
  [ -f "$DADOS/$f" ] || { echo "ERRO: falta $DADOS/$f (veja docs/android.md)." >&2; exit 1; }
done

mkdir -p "$HOME/Library/Logs/PeladaRobo" "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$ROTULO</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$AQUI/scripts/android/publicar-ao-mergear.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/PeladaRobo/publicar.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/PeladaRobo/publicar.log</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
PLIST
launchctl bootstrap "$ALVO" "$PLIST"
echo "serviço $ROTULO instalado: confere a main de 5 em 5 minutos. Registro em ~/Library/Logs/PeladaRobo/publicar.log"
