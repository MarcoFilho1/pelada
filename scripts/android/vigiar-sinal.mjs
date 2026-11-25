// Vigia o sinal de vida do robô que roda num celular e avisa no Mac quando algo muda.
//
//   ROBO_SINAL_URL=https://<site>/api/robo/sinal ROBO_SINAL_CHAVE=<a chave> node scripts/android/vigiar-sinal.mjs
//   ... --uma-vez     só mostra como está agora e sai (código 0 = tudo certo, 1 = problema)
//
// Pergunta ao site de 2 em 2 minutos. Quando aparece um problema (o celular sumiu, o WhatsApp
// desconectou, o robô parou) mostra uma notificação do macOS; quando volta ao normal, outra.
// Não repete o mesmo aviso a cada volta. Só avisa com o Mac ligado: para ser avisado sempre,
// aponte um serviço de monitoramento para o mesmo endereço (ele responde 503 quando há problema).
import { execFile } from 'node:child_process';

const url = process.env.ROBO_SINAL_URL;
const chave = process.env.ROBO_SINAL_CHAVE;
if (!url || !chave) {
  console.error('Faltam ROBO_SINAL_URL e ROBO_SINAL_CHAVE no ambiente.');
  process.exit(2);
}
const umaVez = process.argv.includes('--uma-vez');
const INTERVALO_MS = 2 * 60_000;

const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function notificar(titulo, texto) {
  const limpo = (s) => s.replaceAll('\\', '').replaceAll('"', "'");
  execFile('osascript', ['-e', `display notification "${limpo(texto)}" with title "${limpo(titulo)}" sound name "Basso"`], () => {});
}

/** Devolve { problema, estado }: `problema` é `null` quando está tudo certo. */
async function consultar() {
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(20_000) });
    if (r.status === 401) return { problema: 'O site recusou a chave do sinal (confira ROBO_SINAL_CHAVE).', estado: null };
    const estado = await r.json();
    return { problema: estado.problema ?? (r.ok ? null : `O site respondeu ${r.status}.`), estado };
  } catch (e) {
    return { problema: `Não consegui falar com o site: ${e.cause?.code ?? e.message}`, estado: null };
  }
}

function resumo(estado) {
  const s = estado?.sinal;
  if (!s) return '';
  const bateria = s.bateria === null ? '' : `, bateria ${s.bateria}%${s.carregando ? ' (carregando)' : ''}`;
  return `${s.aparelho}: último sinal há ${estado.haSegundos} s, robô ${s.versaoDoRobo}${bateria}`;
}

let anterior; // undefined = primeira volta
for (;;) {
  const { problema, estado } = await consultar();
  if (umaVez) {
    console.log(problema ?? 'Tudo certo.');
    if (estado?.sinal) {
      console.log(resumo(estado));
      for (const nota of estado.sinal.notas ?? []) console.log(`  ${nota}`);
    }
    process.exit(problema ? 1 : 0);
  }
  if (problema !== anterior) {
    console.log(`${hora()} ${problema ?? `tudo certo (${resumo(estado)})`}`);
    if (problema) notificar('Robô da Pelada', problema);
    else if (anterior !== undefined) notificar('Robô da Pelada', 'Voltou ao normal.');
    anterior = problema;
  }
  await new Promise((r) => setTimeout(r, INTERVALO_MS));
}
