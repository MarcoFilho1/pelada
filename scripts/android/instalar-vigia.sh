#!/bin/zsh
# Instala (ou tira) o serviço do Mac que vigia o sinal de vida do robô do celular e avisa quando
# ele some, quando o WhatsApp desconecta ou quando o robô para. Rode de dentro de uma cópia do
# repositório FORA da Mesa e de Documentos (o macOS não deixa serviços lerem essas pastas), a
# mesma do publicador, por exemplo ~/pelada-publicar:
#
#   scripts/android/instalar-vigia.sh            instala e já começa a vigiar
#   scripts/android/instalar-vigia.sh tirar      desinstala
#
# Antes, precisa existir ~/Library/Application Support/PeladaRobo/android-publicar.env com
# ROBO_SINAL_URL e ROBO_SINAL_CHAVE. ROBO_ALERTA_URL, no mesmo arquivo, é opcional (aviso no celular).
set -eu
ROTULO=com.pelada.vigia
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
ENV="$HOME/Library/Application Support/PeladaRobo/android-publicar.env"
[ -f "$ENV" ] || { echo "ERRO: falta $ENV (veja docs/android.md)." >&2; exit 1; }
grep -q '^ROBO_SINAL_URL=' "$ENV" && grep -q '^ROBO_SINAL_CHAVE=' "$ENV" || { echo "ERRO: $ENV precisa de ROBO_SINAL_URL e ROBO_SINAL_CHAVE." >&2; exit 1; }

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
    <string>-c</string>
    <string>export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:\$PATH"; set -a; . "$ENV"; set +a; exec node "$AQUI/scripts/android/vigiar-sinal.mjs"</string>
  </array>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>60</integer>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/PeladaRobo/vigia.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/PeladaRobo/vigia.log</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
PLIST
launchctl bootstrap "$ALVO" "$PLIST"
echo "serviço $ROTULO instalado: olha o sinal de vida de 2 em 2 minutos. Registro em ~/Library/Logs/PeladaRobo/vigia.log"
