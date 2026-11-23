#!/bin/zsh
# Reinicia o robô na versão atual do código: compila e liga o compilado.
# Com o serviço instalado (pnpm robo:instalar), reinicia o serviço; sem ele, liga em segundo plano.
# Uso: scripts/robo-reiniciar.sh   (da pasta do projeto)
set -e
cd "$(dirname "$0")/.."
ROTULO=com.pelada.robo
LOG="$HOME/Library/Logs/PeladaRobo/robo.log"
mkdir -p "$(dirname "$LOG")"

node scripts/compilar-robo.mjs

if launchctl print "gui/$(id -u)/$ROTULO" >/dev/null 2>&1; then
  # Serviço: o launchd para o robô e liga de novo com o compilado novo.
  pkill -f "pnpm -s robo$" 2>/dev/null || true
  launchctl kickstart -k "gui/$(id -u)/$ROTULO"
  echo "serviço do robô reiniciado; log em $LOG"
else
  # Sem serviço: para o robô atual (compilado ou o antigo, via pnpm/tsx), espera sair e liga.
  pkill -f "node .*dist/robo/principal.mjs" 2>/dev/null || true
  pkill -f "pnpm -s robo$" 2>/dev/null || true
  pkill -f "tsx/dist/cli.mjs src/robo/principal.ts" 2>/dev/null || true
  for i in {1..20}; do
    pgrep -f "dist/robo/principal.mjs|src/robo/principal.ts" >/dev/null || break
    sleep 0.5
  done
  nohup node --enable-source-maps dist/robo/principal.mjs >> "$LOG" 2>&1 &
  echo "robô ligado (pid $!); log em $LOG"
fi
sleep 8
tail -4 "$LOG"
