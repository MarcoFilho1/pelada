# Robô que se revisa (auto-revisão) — design

## Por quê
Hoje o Marco descobre os erros do robô olhando o grupo e me pedindo "veja os logs". A ideia é o próprio
robô fazer essa revisão nos dias de uso, propor as correções e só entrar no ar depois do "pode mergear" dele.

## Objetivos
- Guardar as conversas inteiras (o que chegou e o que saiu), só no Mac, por 7 dias.
- Revisar sozinho segunda, terça e quarta às 23:00 (os únicos dias em que o robô é usado).
- Para cada problema real: causa → teste que falha → correção → testes verdes → PR na develop.
- Mandar ao Marco, no privado, o que foi identificado e como foi corrigido.
- "pode mergear" do Marco no privado: roda os testes de novo, junta na develop e na main, atualiza e reinicia.

## Não-objetivos / anti-objetivos
- Nunca entra no ar sem o "pode mergear".
- Nunca mexe nos limites anti-ban, nunca grava no banco de produção, nunca põe segredo ou telefone no repo
  (se achar que precisa, só sugere na mensagem).
- Nada vai para a nuvem além do que o Claude Code já usa; as conversas ficam fora do repo.

## Abordagens
1. **Claude Code no Mac, agendado (escolhida pelo Marco).** Já tem código, testes, `gh` e acesso aos logs;
   usa a assinatura do Claude, sem conta de API. Só roda com o Mac ligado (como o robô).
2. Programa próprio com a API do Claude — refazer leitura/edição/testes do zero, pago por uso. Descartada.
3. Agendamento na nuvem — não enxerga os logs do Mac. Descartada.

## Como fica
1. **Diário de conversas** (`src/robo/diario.ts`): a cada mensagem tratada, uma linha JSON em
   `~/Library/Logs/PeladaRobo/conversas/AAAA-MM-DD.jsonl` com hora, grupo/privado, nome de quem falou, texto
   recebido, partes enviadas, ferramentas que a IA usou e erro (se houve). Nome, não telefone. Na partida e
   uma vez por dia, apaga arquivos com mais de 7 dias.
2. **Revisão agendada**: LaunchAgent `com.pelada.revisao` (seg/ter/qua 23:00) chama `scripts/revisao/rodar.sh`,
   que atualiza um clone só dela (`~/pelada-revisao`, branch develop) e roda `claude -p` com
   `scripts/revisao/PROMPT.md`, ferramentas limitadas (sem `gh pr merge`) e tempo máximo de 45 min.
   Lê: conversas do dia, `robo.log` do dia, mensagens enviadas no `gate.db` (só leitura).
   Saída: `revisao/resultado.json` sempre (mesmo sem nada a corrigir, ou se a revisão falhar); no máximo **um PR por noite** (um commit por problema) e `~/Library/Logs/PeladaRobo/revisao/pendente.json`
   com o número do PR e, por problema, "o que vi" e "como corrigi".
3. **Aviso**: toda revisão termina com um aviso ao Marco — sem problema real, um "🔎 Revisão de hoje: nada a melhorar" (assim ele sabe que funcionou); com problema, o robô vê o `pendente.json` novo e manda ao dono (1º número de `ROBO_ADMINS`) a mensagem, em partes
   curtas, com o link do PR.
4. **"pode mergear"**: no privado, só do dono, só com revisão pendente, antes do parser e da IA. O robô responde
   "⏳ juntando…" e solta `scripts/revisao/mergear.sh` desligado dele: testes (passo separado) → merge do PR →
   PR develop→main e merge → confere main = develop → `git pull` em `~/pelada` → `robo-reiniciar.sh`. O
   resultado vai num arquivo; o robô novo, ao subir, manda "✅ no ar" ou o motivo da falha (nada entra se os
   testes falharem).

## Decisões minhas (o Marco pode trocar)
- Revisão nova substitui a pendente; o PR antigo fica aberto para decidir à mão.
- Só a frase "pode mergear" (sem acento/caixa) dispara; qualquer outra coisa segue o caminho normal.

## Fica para quem construir
- Formato exato do JSON, texto do PROMPT.md, lista de ferramentas permitidas ao `claude -p`.
- Confirmar que o `claude -p` funciona dentro do launchd (login no chaveiro) com uma rodada de teste.
