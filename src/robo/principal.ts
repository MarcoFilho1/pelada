// Robô do WhatsApp. Uso:
//   pnpm robo                      laço de 1 em 1 minuto (o LaunchAgent roda este)
//   pnpm robo:ensaio [--agora=ISO] [--estado=caminho]   uma decisão, só imprime
//   pnpm robo:configurar [--nome="Outro grupo"]         QR + escolher o grupo
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { getDb } from '@/db/client';
import { estadoDaSemana } from '@/server/presencas';
import { decidir } from './agenda';
import { gravarEstado, lerEstado, nomeDoGrupo, pastaDoRobo } from './estado';
import { fotografar } from './foto';
import { dentroDaJanela, proximaJanela } from './janela';
import { montarMensagem } from './mensagem';
import { umaVolta } from './volta';
import type { WhatsApp } from './whatsapp';

const NOME_DO_GRUPO = 'Pelada 3.0';
const VOLTA_MS = 60_000;

const pasta = pastaDoRobo(process.env, homedir());
const arquivoEstado = join(pasta, 'estado.json');
const pastaAuth = join(pasta, 'auth');

/** "2026-11-09 14:00" no horário de Recife (sempre UTC-3). */
function hora(d: Date): string {
  return new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
}
const log = (linha: string) => console.log(`${hora(new Date())} ${linha}`);

function parar(msg: string, codigo = 1): never {
  console.error(msg);
  process.exit(codigo);
}

function argumento(nome: string): string | undefined {
  const pref = `--${nome}=`;
  return process.argv.find((a) => a.startsWith(pref))?.slice(pref.length);
}

/** DATABASE_URL do ambiente (ex.: ensaio com o banco local) ou do `.env` da pasta do robô. */
function carregarBanco(): void {
  if (process.env.DATABASE_URL) return;
  const arquivo = join(pasta, '.env');
  if (existsSync(arquivo)) process.loadEnvFile(arquivo);
  if (!process.env.DATABASE_URL) {
    parar(
      `O robô não sabe onde está o banco da pelada.\n` +
        `Crie o arquivo "${arquivo}" com uma linha só:\n` +
        `DATABASE_URL=<a mesma DATABASE_URL do site na Vercel>`,
    );
  }
}

function lerEstadoOuParar(arquivo: string) {
  try {
    return lerEstado(arquivo);
  } catch (err) {
    return parar((err as Error).message);
  }
}

/** No laço, `prazoMs` evita ficar preso esperando a rede (a volta seguinte tenta de novo). */
async function conectarWhatsApp(mostrarQr: boolean, prazoMs?: number): Promise<WhatsApp> {
  const { conectar, ErroFatalWhatsApp } = await import('./whatsapp');
  try {
    return await conectar({
      pastaAuth,
      mostrarQr,
      prazoMs,
      log,
      aoFalhar: (e) => {
        log(e.message);
        process.exit(1);
      },
    });
  } catch (err) {
    if (err instanceof ErroFatalWhatsApp) parar(`${hora(new Date())} ${err.message}`);
    throw err;
  }
}

// ---------- ensaio ----------

async function ensaio(): Promise<void> {
  carregarBanco();
  const textoAgora = argumento('agora');
  const now = textoAgora ? new Date(textoAgora) : new Date();
  if (Number.isNaN(now.getTime())) parar(`--agora inválido: "${textoAgora}". Exemplo: --agora=2026-11-11T12:00:00-03:00`);
  const estado = lerEstadoOuParar(argumento('estado') ?? arquivoEstado);
  const lista = await estadoDaSemana(getDb(), now);
  const foto = fotografar(lista);
  const tipo = decidir(now, foto, estado);
  console.log(`[ensaio] ${hora(now)} (Recife) → ${tipo ?? 'nada a enviar'}`);
  if (tipo) console.log(`\n${montarMensagem(tipo, lista, foto, estado.ultimo?.foto ?? null)}`);
}

// ---------- configurar ----------

async function configurar(): Promise<void> {
  const nome = argumento('nome') ?? NOME_DO_GRUPO;
  const estado = lerEstadoOuParar(arquivoEstado);
  const wa = await conectarWhatsApp(true);
  const grupos = await wa.gruposChamados(nome);
  let escolhido = grupos[0];
  if (grupos.length === 0) {
    await wa.fechar();
    parar(`Nenhum grupo chamado "${nome}" neste número. Adicione o número do robô ao grupo (nome exato) e rode de novo.`);
  }
  if (grupos.length > 1) {
    console.log(`Há ${grupos.length} grupos chamados "${nome}":`);
    grupos.forEach((g, i) => console.log(`  ${i + 1}) ${g.participantes} participantes (${g.id})`));
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const resposta = Number((await rl.question('Qual é o certo? Digite o número: ')).trim());
    rl.close();
    escolhido = grupos[resposta - 1];
    if (!escolhido) {
      await wa.fechar();
      parar('Número inválido. Rode `pnpm robo:configurar` de novo.');
    }
  }
  // Grupo novo começa do zero: a próxima mensagem dele é a primeira da semana.
  const novo =
    estado.grupoId === escolhido.id
      ? { ...estado, grupoNome: escolhido.nome }
      : { ultimo: null, aberturaEnviada: null, grupoId: escolhido.id, grupoNome: escolhido.nome };
  gravarEstado(arquivoEstado, novo);
  console.log(`Pronto: o robô vai mandar no grupo "${escolhido.nome}" (${escolhido.participantes} participantes).`);
  await new Promise((r) => setTimeout(r, 2_000)); // deixa a Baileys terminar de salvar o login
  await wa.fechar();
}

// ---------- laço ----------

let cafe: ChildProcess | null = null;

/** Dentro da janela, um `caffeinate -i` preso ao nosso pid (morre junto com o robô). */
function manterAcordado(sim: boolean): void {
  if (sim && !cafe) {
    const filho = spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
    filho.on('exit', () => {
      if (cafe === filho) cafe = null;
    });
    filho.on('error', (e) => log(`caffeinate falhou: ${e.message}`));
    cafe = filho;
  } else if (!sim && cafe) {
    cafe.kill();
    cafe = null;
  }
}

async function laco(): Promise<void> {
  carregarBanco();
  let estado = lerEstadoOuParar(arquivoEstado);
  const grupoId = estado.grupoId;
  if (!grupoId) parar('O robô ainda não sabe em qual grupo mandar. Rode `pnpm robo:configurar` primeiro.');
  const db = getDb();

  let wa: WhatsApp | null = await conectarWhatsApp(false, 2 * 60_000); // confere a sessão já ao ligar
  const sair = async () => {
    manterAcordado(false);
    await wa?.fechar().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', sair);
  process.on('SIGINT', sair);
  log(`Robô ligado. Vai mandar em: ${nomeDoGrupo(estado)}. Estado em ${arquivoEstado}.`);

  let estavaDentro: boolean | null = null;
  for (;;) {
    const now = new Date();
    const dentro = dentroDaJanela(now);
    if (!dentro) {
      manterAcordado(false);
      if (wa) {
        await wa.fechar().catch(() => {});
        wa = null;
      }
      // Uma linha só ao sair da janela (não uma por minuto a semana toda).
      if (estavaDentro !== false) log(`fora da janela; próxima começa ${hora(proximaJanela(now))}`);
    } else {
      if (estavaDentro !== true) log('janela aberta: o Mac fica acordado até quarta 20:30.');
      manterAcordado(true);
      estado = await umaVolta(now, estado, {
        lerLista: (n) => estadoDaSemana(db, n),
        enviar: async (texto) => {
          wa ??= await conectarWhatsApp(false, 2 * 60_000);
          await wa.enviar(grupoId, texto);
        },
        gravar: (e) => gravarEstado(arquivoEstado, e),
        log,
      });
    }
    estavaDentro = dentro;
    // Sempre 60 s, também fora da janela (só confere o relógio): um timer longo atrasaria a
    // abertura depois do Mac dormir, porque o tempo dormindo não conta para o setTimeout.
    await new Promise((r) => setTimeout(r, VOLTA_MS));
  }
}

const modo = process.argv.includes('--ensaio') ? ensaio : process.argv.includes('configurar') ? configurar : laco;
modo().then(
  () => {
    if (modo !== laco) process.exit(0);
  },
  (err) => parar(`Erro inesperado: ${(err as Error).stack ?? err}`),
);
