// Robô do WhatsApp. Uso:
//   pnpm robo                      laço de 1 em 1 minuto (o LaunchAgent roda este)
//   pnpm robo:ensaio [--agora=ISO] [--estado=caminho]   uma decisão, só imprime
//   pnpm robo:configurar [--nome="Outro grupo"]         QR + escolher o grupo
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { getDb } from '@/db/client';
import { estadoDaSemana, estadoDaSemanaSemCriar } from '@/server/presencas';
import { decidir, emSilencio } from './agenda';
import { aposEnvio, gravarEstado, lerEstado, nomeDoGrupo, pastaDoRobo } from './estado';
import { consultar } from './consultas';
import { ferramentasDeLeitura } from './ferramentas';
import { fotografar } from './foto';
import { Freio } from './freio';
import { perguntar } from './ia';
import { dentroDaJanela, proximaJanela } from './janela';
import { mexerNaLista } from './lista-zap';
import { montarMensagem } from './mensagem';
import { calvinhoDoEnv, configDasRespostas, podeGravarLista, responder, type MensagemRecebida } from './responder';
import { confirmarSorteio, proporSorteio, type Proposta } from './sorteio-zap';
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

/**
 * Lê o `.env` da pasta do robô (DATABASE_URL, OPENROUTER_API_KEY, OPENROUTER_MODEL, ROBO_ADMINS e, opcional, ROBO_CALVINHO).
 * O que já está no ambiente vale mais (ex.: ensaio com o banco local).
 */
function carregarBanco(): void {
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
async function conectarWhatsApp(mostrarQr: boolean, prazoMs?: number, aoReceber?: (m: MensagemRecebida) => void): Promise<WhatsApp> {
  const { conectar, ErroFatalWhatsApp } = await import('./whatsapp');
  try {
    return await conectar({
      pastaAuth,
      mostrarQr,
      prazoMs,
      log,
      aoReceber,
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
  const lista = await estadoDaSemanaSemCriar(getDb(), now); // só lê: o ensaio nunca cria pelada
  const foto = fotografar(lista);
  const tipo = decidir(now, foto, estado);
  console.log(`[ensaio] ${hora(now)} (Recife) → ${tipo ?? 'nada a enviar'}`);
  if (tipo) console.log(`\n${montarMensagem(tipo, lista, foto, estado.ultimo?.foto ?? null)}`);
}

// ---------- configurar ----------

/**
 * Conexão do `configurar`: se o login guardado não vale mais (o WhatsApp desconectou o aparelho),
 * guarda a pasta antiga ao lado e começa de novo com um QR novo, em vez de só repetir o aviso.
 */
async function conectarParaConfigurar(): Promise<WhatsApp> {
  const { ErroFatalWhatsApp, MSG_DESLOGADO } = await import('./whatsapp');
  try {
    return await conectarSemParar();
  } catch (err) {
    if (!(err instanceof ErroFatalWhatsApp) || err.message !== MSG_DESLOGADO || !existsSync(pastaAuth)) {
      if (err instanceof ErroFatalWhatsApp) parar(`${hora(new Date())} ${err.message}`);
      throw err;
    }
    const guardada = `${pastaAuth}-antigo-${Date.now()}`;
    renameSync(pastaAuth, guardada);
    log(`O login antigo do WhatsApp não vale mais (guardado em ${guardada}). Leia o QR novo.`);
    return conectarWhatsApp(true);
  }
}

/** Como `conectarWhatsApp(true)`, mas devolve o erro fatal em vez de parar o programa. */
async function conectarSemParar(): Promise<WhatsApp> {
  const { conectar } = await import('./whatsapp');
  return conectar({
    pastaAuth,
    mostrarQr: true,
    log,
    aoFalhar: (e) => {
      log(e.message);
      process.exit(1);
    },
  });
}

async function configurar(): Promise<void> {
  const nome = argumento('nome') ?? NOME_DO_GRUPO;
  const estado = lerEstadoOuParar(arquivoEstado);
  const wa = await conectarParaConfigurar();
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

/** Uma tarefa por vez: as respostas e a volta automática mexem no mesmo `estado`. */
function criarFila() {
  let fim: Promise<unknown> = Promise.resolve();
  return <T>(tarefa: () => Promise<T>): Promise<T> => {
    const r = fim.then(tarefa, tarefa);
    fim = r.catch(() => {});
    return r;
  };
}

async function laco(): Promise<void> {
  carregarBanco();
  let estado = lerEstadoOuParar(arquivoEstado);
  const grupoId = estado.grupoId;
  if (!grupoId) parar('O robô ainda não sabe em qual grupo mandar. Rode `pnpm robo:configurar` primeiro.');
  const db = getDb();
  const emFila = criarFila();

  const { ia, admins } = configDasRespostas(process.env);
  const freio = new Freio(() => new Date());
  const proposta = { atual: null as Proposta | null };
  const gravar = (novo: typeof estado) => {
    try {
      gravarEstado(arquivoEstado, novo);
    } catch (err) {
      log(`ATENÇÃO: lista enviada, mas o estado não foi gravado (${(err as Error).message}).`);
    }
  };
  // Uma conexão só, aberta abaixo; mensagens que chegam enquanto ela abre esperam por ela.
  let conexao: Promise<WhatsApp> | null = null;
  /** Envio com ack, só no grupo configurado; a conexão pode ter demorado: nada depois das 23:00. */
  const enviarNoGrupo = async (texto: string) => {
    const wa = await conexao!;
    if (emSilencio(new Date())) throw new Error('passou das 23:00; a mensagem espera até as 08:00');
    await wa.enviar(grupoId, texto);
  };

  const tratar = async (m: MensagemRecebida) => {
    try {
      const r = await responder(m, {
        estadoGrupoId: grupoId,
        freio,
        admins,
        calvinho: calvinhoDoEnv(process.env),
        ia,
        ultimo: estado.ultimo,
        proposta,
        // Fora da janela só lê (nunca cria a pelada da semana), como o ensaio.
        lerLista: (n) => (dentroDaJanela(n) ? estadoDaSemana(db, n) : estadoDaSemanaSemCriar(db, n)),
        propor: (n, tel) => proporSorteio(db, n, tel),
        confirmar: (n, tel, p) => confirmarSorteio(db, n, tel, p),
        // As ações da lista seguem o caminho normal do site (depois da abertura de segunda, criam a pelada se preciso).
        mexerNaLista: (acao, nome, n) => mexerNaLista(db, acao, nome, n),
        consultar: (tipo, n) => consultar(db, tipo, n),
        perguntar: (texto, { agora }) => perguntar(texto, { chave: ia!.chave, modelo: ia!.modelo, ferramentas: ferramentasDeLeitura(db, agora), agora }),
        enviar: enviarNoGrupo,
        log,
      });
      if (!r) return;
      log(`respondeu a uma marcação (${r.texto.split('\n')[0].slice(0, 60)})`);
      if (r.ehListaCompleta && r.gravar && podeGravarLista(new Date(), r.gravar.foto, estado)) {
        estado = aposEnvio(estado, new Date(), r.gravar.tipo, r.gravar.foto);
        gravar(estado);
      }
    } catch (err) {
      log(`erro ao responder (não tenta de novo): ${(err as Error).message}`);
    }
  };
  const aoReceber = (m: MensagemRecebida) => {
    // Filtro barato antes da fila: só marcação (ou resposta ao robô). A de outro grupo vai ao
    // `responder` só para deixar a linha "marcação ignorada (outro grupo)" no log.
    if (m.mencionaORobo || m.respondeAoRobo) void emFila(() => tratar(m));
  };

  // Fica conectado a semana toda para responder (a Baileys reconecta sozinha nas quedas).
  conexao = conectarWhatsApp(false, 2 * 60_000, aoReceber);
  const wa = await conexao;
  const sair = async () => {
    manterAcordado(false);
    await wa.fechar().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', sair);
  process.on('SIGINT', sair);
  log(`Robô ligado. Vai mandar em: ${nomeDoGrupo(estado)}. Estado em ${arquivoEstado}.`);
  log(`Respostas: perguntas livres ${ia ? 'ligadas' : 'desligadas'}; ${admins.length} admin(s) para sortear.`);

  let estavaDentro: boolean | null = null;
  for (;;) {
    const now = new Date();
    const dentro = dentroDaJanela(now);
    if (!dentro) {
      manterAcordado(false);
      // Uma linha só ao sair da janela (não uma por minuto a semana toda).
      if (estavaDentro !== false) log(`fora da janela (só responde marcações); próxima começa ${hora(proximaJanela(now))}`);
    } else {
      if (estavaDentro !== true) log('janela aberta: o Mac fica acordado até quarta 20:30.');
      manterAcordado(true);
      await emFila(async () => {
        estado = await umaVolta(now, estado, {
          lerLista: (n) => estadoDaSemana(db, n),
          enviar: enviarNoGrupo,
          gravar: (e) => gravarEstado(arquivoEstado, e),
          log,
        });
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
  (err) => {
    const e = err as NodeJS.ErrnoException;
    if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH'].includes(e?.code ?? '')) {
      parar(`${hora(new Date())} Sem internet (ou o servidor não respondeu): ${e.code}. O robô para e liga de novo sozinho.`);
    }
    parar(`Erro inesperado: ${e?.stack ?? err}`);
  },
);
