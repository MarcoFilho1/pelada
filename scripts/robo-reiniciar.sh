#!/bin/zsh
# Reinicia o robô na versão atual do código: compila, para o que estiver rodando e liga o compilado.
# Uso: scripts/robo-reiniciar.sh   (da pasta do projeto)
set -e
cd "$(dirname "$0")/.."
PASTA="${PELADA_ROBO_DIR:-$HOME/Library/Application Support/PeladaRobo}"
LOG="$PASTA/robo-zapgate.log"

node scripts/compilar-robo.mjs

# Para o robô atual (compilado ou o antigo, via pnpm/tsx), e espera sair.
pkill -f "node dist/robo/principal.mjs" 2>/dev/null || true
pkill -f "pnpm -s robo$" 2>/dev/null || true
pkill -f "tsx/dist/cli.mjs src/robo/principal.ts" 2>/dev/null || true
for i in {1..20}; do
  pgrep -f "dist/robo/principal.mjs|src/robo/principal.ts" >/dev/null || break
  sleep 0.5
done

nohup node --enable-source-maps dist/robo/principal.mjs >> "$LOG" 2>&1 &
echo "robô ligado (pid $!); log em $LOG"
sleep 8
tail -4 "$LOG"
