#!/bin/zsh
# Agenda a revisão noturna: LaunchAgent com.pelada.revisao, segunda, terça e quarta às 23:00.
# Uso: scripts/revisao/instalar.sh            (instala ou atualiza)
#      scripts/revisao/instalar.sh remover
set -e
ROTULO=com.pelada.revisao
PLIST="$HOME/Library/LaunchAgents/$ROTULO.plist"
launchctl bootout "gui/$(id -u)/$ROTULO" 2>/dev/null || true
if [[ "${1:-}" == remover ]]; then rm -f "$PLIST"; echo "revisão desagendada"; exit 0; fi
dia() { echo "    <dict><key>Weekday</key><integer>$1</integer><key>Hour</key><integer>23</integer><key>Minute</key><integer>0</integer></dict>"; }
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$ROTULO</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$HOME/pelada/scripts/revisao/rodar.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
$(dia 1)
$(dia 2)
$(dia 3)
  </array>
  <key>StandardOutPath</key>
  <string>$HOME/Library/Logs/PeladaRobo/revisao.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/Library/Logs/PeladaRobo/revisao.log</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
PL
plutil -lint "$PLIST" >/dev/null
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "revisão agendada: seg/ter/qua 23:00 ($PLIST)"
