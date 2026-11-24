#!/bin/zsh
# Junta o PR da auto-revisão depois do "pode mergear" do dono e reinicia o robô.
# O robô solta este script desligado dele (sobrevive ao reinício). Sempre termina escrevendo
# ~/Library/Logs/PeladaRobo/revisao/merge.json (ok ou falhou); o robô novo lê e avisa o dono.
# Uso: scripts/revisao/mergear.sh <número do PR>
set -u
PR="${1:?número do PR}"
CAIXA="$HOME/Library/Logs/PeladaRobo/revisao"
CLONE="$HOME/pelada-revisao"
SERVICO="$HOME/pelada"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$CAIXA"

fim() { # fim <ok|falhou> [motivo]
  local motivo="${2:-}"
  printf '{"quando":"%s","status":"%s","pr":%s%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$PR" \
    "${motivo:+,\"motivo\":\"$motivo\"}" > "$CAIXA/merge.json.tmp" && mv "$CAIXA/merge.json.tmp" "$CAIXA/merge.json"
  echo "$(date '+%F %R') merge do PR #$PR: $1 ${motivo}"
}

echo "$(date '+%F %R') juntando o PR #$PR"
cd "$CLONE" || { fim falhou "o clone da revisão não existe"; exit 1; }
git fetch -q origin || { fim falhou "sem acesso ao GitHub"; exit 1; }
gh pr checkout "$PR" -f >/dev/null 2>&1 || { fim falhou "não consegui abrir o PR"; exit 1; }
pnpm install --frozen-lockfile --silent || { fim falhou "a instalação das dependências falhou"; exit 1; }
# Testes num passo separado, antes de qualquer merge.
pnpm vitest run || { fim falhou "os testes falharam"; exit 1; }
pnpm tsc --noEmit -p . || { fim falhou "a checagem de tipos falhou"; exit 1; }

gh pr merge "$PR" --merge --delete-branch || { fim falhou "o GitHub recusou o merge na develop"; exit 1; }
git fetch -q origin
URL=$(gh pr create --base main --head develop --title "release: auto-revisão (#$PR)" --body "Leva o #$PR para a main." 2>/dev/null)
[[ -n "$URL" ]] || { fim falhou "não consegui abrir o PR para a main (a develop já tem o #$PR)"; exit 1; }
gh pr merge "$URL" --merge || { fim falhou "o GitHub recusou o merge na main (a develop já tem o #$PR)"; exit 1; }
git fetch -q origin
git diff --quiet origin/develop origin/main || { fim falhou "a main ficou diferente da develop"; exit 1; }

cd "$SERVICO" || { fim falhou "a pasta do robô não existe"; exit 1; }
git pull -q --ff-only || { fim falhou "não consegui atualizar a pasta do robô (o PR já está na main)"; exit 1; }
node scripts/compilar-robo.mjs || { fim falhou "a compilação falhou (o PR já está na main; o robô segue na versão anterior)"; exit 1; }
# Avisa "ok" antes do reinício: quem lê é o robô novo.
fim ok
scripts/robo-reiniciar.sh
