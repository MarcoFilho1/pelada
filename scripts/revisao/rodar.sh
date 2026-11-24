#!/bin/zsh
# Revisão noturna do robô (seg/ter/qua 23:00, pelo launchd com.pelada.revisao): o Claude Code lê as
# conversas e o log do dia, corrige com testes num clone só dele e abre no máximo um PR. Sempre termina
# com ~/Library/Logs/PeladaRobo/revisao/resultado.json, que o robô lê e manda ao dono.
# Uso: scripts/revisao/rodar.sh
set -u
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
LOGS="$HOME/Library/Logs/PeladaRobo"
export REVISAO_DIR="$LOGS/revisao"
export HOJE="$(TZ=America/Recife date +%F)"
export CONVERSAS="$LOGS/conversas/$HOJE.jsonl"
export ROBO_LOG="$LOGS/robo.log"
export GATE_DB="$HOME/zapgate-teste/dados/sessions/pelada/gate.db"
CLONE="$HOME/pelada-revisao"
PROMPT="$(dirname "$0")/PROMPT.md"
LIMITE_S=2700 # 45 min
mkdir -p "$REVISAO_DIR"

# O robô só vê resultado.json quando ele já está inteiro (mv é atômico na mesma pasta).
entregar() { mv -f "$1" "$REVISAO_DIR/resultado.json"; }
falhou() {
  printf '{"quando":"%s","status":"falhou","motivo":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" > "$REVISAO_DIR/falhou.tmp"
  entregar "$REVISAO_DIR/falhou.tmp"
  echo "$(date '+%F %R') revisão falhou: $1"
  rmdir "$REVISAO_DIR/rodando" 2>/dev/null
  exit 1
}

# Trava: uma revisão por vez. Uma trava com mais de 2 h é sobra de uma rodada que morreu (reboot, kill).
[[ -n "$(find "$REVISAO_DIR/rodando" -maxdepth 0 -mmin +120 2>/dev/null)" ]] && rmdir "$REVISAO_DIR/rodando"
mkdir "$REVISAO_DIR/rodando" 2>/dev/null || { echo "$(date '+%F %R') já tem uma revisão rodando"; exit 0; }
echo "$(date '+%F %R') revisão de $HOJE começou"
PROMPT_TEXTO="Valores de hoje: HOJE=$HOJE; CONVERSAS=$CONVERSAS; ROBO_LOG=$ROBO_LOG; GATE_DB=$GATE_DB; REVISAO_DIR=$REVISAO_DIR

$(cat "$PROMPT")" || falhou "não achei as instruções da revisão"
rm -f "$REVISAO_DIR/saida.json"
# Revisão nova substitui a pendente: um "pode mergear" depois dela nunca junta o PR de outra noite.
rm -f "$REVISAO_DIR/pendente.json"

# Clone só da revisão (fora do Desktop: o launchd não entra lá), sempre igual à develop.
if [[ ! -d "$CLONE/.git" ]]; then
  git clone -q "$(git -C "$HOME/pelada" remote get-url origin)" "$CLONE" || falhou "não consegui clonar o repositório"
fi
cd "$CLONE" || falhou "o clone da revisão não abriu"
git fetch -q origin && git checkout -q develop && git reset -q --hard origin/develop && git clean -qfd || falhou "não consegui atualizar o clone"
# Sem .env de propósito: a revisão não tem como chegar no banco de produção.
pnpm install --frozen-lockfile --silent || falhou "a instalação das dependências falhou"

claude -p "$PROMPT_TEXTO" \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Edit" "Write" "Grep" "Glob" \
    "Bash(pnpm vitest:*)" "Bash(pnpm tsc:*)" "Bash(pnpm eslint:*)" \
    "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)" "Bash(git add:*)" "Bash(git commit:*)" \
    "Bash(git checkout -b revisao/:*)" "Bash(git switch -c revisao/:*)" "Bash(git push -u origin revisao/:*)" \
    "Bash(gh pr create:*)" "Bash(gh pr view:*)" "Bash(sqlite3 -readonly:*)" "Bash(grep:*)" "Bash(tail:*)" "Bash(head:*)" "Bash(ls:*)" \
  --disallowedTools "Bash(gh pr merge:*)" "Bash(gh api:*)" "Bash(git push origin develop:*)" "Bash(git push origin main:*)" \
    "Read(**/.env*)" "Read(~/.ssh/**)" "Read(~/zapgate-teste/.chave)" "Read(~/Desktop/**)" "Read(~/pelada/**)" &
PID=$!
( sleep $LIMITE_S && kill $PID 2>/dev/null && echo "$(date '+%F %R') passou de 45 min; revisão parada" ) &
VIGIA=$!
wait $PID
CODIGO=$?
kill $VIGIA 2>/dev/null

if [[ ! -s "$REVISAO_DIR/saida.json" ]]; then
  if (( CODIGO == 143 )); then falhou "passou de 45 minutos"; fi
  falhou "o Claude Code terminou sem escrever o resultado (código $CODIGO)"
fi
entregar "$REVISAO_DIR/saida.json"
echo "$(date '+%F %R') revisão terminou: $(cat "$REVISAO_DIR/resultado.json")"
rmdir "$REVISAO_DIR/rodando" 2>/dev/null
