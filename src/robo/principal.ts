// Robô do WhatsApp. Uso:
//   pnpm robo                      laço de 1 em 1 minuto (o LaunchAgent roda este)
//   pnpm robo:ensaio [--agora=ISO] [--estado=caminho]   uma decisão, só imprime
//   pnpm robo:configurar [--nome="Outro grupo"]         QR + escolher o grupo
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { getDb } from '@/db/client';
import { dataDe } from '@/domain/tempo';
import { estadoDaSemana, estadoDaSemanaSemCriar, restaurarPresenca } from '@/server/presencas';
import { decidir, emSilencio } from './agenda';
import { aposEnvio, gravarEstado, lerEstado, nomeDoGrupo, pastaDoRobo } from './estado';
import { criarLinkAnotador } from '@/server/anotador';
import { cadastrarJogadores } from '@/server/jogadores';
import { respostaCadastro } from './cadastro-zap';
import { mudarNota, textoDasNotas, urlDoSite } from './organizador-zap';
import { consultar } from './consultas';
import { ferramentasDeLeitura } from './ferramentas';
import { fotografar } from './foto';
import { Freio } from './freio';
import { criarCliente, perguntarEmPartes, type UsoDaIA } from './ia';
import { ConversasPrivadas } from './conversa-privada';
import { dentroDaJanela, proximaJanela } from './janela';
import { mexerNaLista } from './lista-zap';
import { montarMensagem } from './mensagem';
import { apelidosDoEnv, calvinhoDoEnv, configDasRespostas, podeGravarLista, responder, type MensagemRecebida } from './responder';
import { anuncioDeGuardado, anuncioParaGuardar, deGuardada, ehAdmin, importarTimesColados, paraGuardar, propostaVencida, salvarProposta, sortearTimesDaNoite, trocarNaProposta, type Proposta } from './sorteio-zap';
import { JuntarMensagens } from './juntar';
import { umaVolta } from './volta';
import type { WhatsApp } from './whatsapp';

// O Node tenta IPv6 e IPv4 do banco com só 250 ms cada; na internet lenta de casa as duas estouravam
// ("Failed query", ETIMEDOUT em ~760 ms) bem antes dos 10 s do pool. Com 2 s cada, a conexão espera a rede.
setDefaultAutoSelectFamilyAttemptTimeout(2000);

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
 * Lê o `.env` da pasta do robô (DATABASE_URL, ANTHROPIC_API_KEY, ROBO_ADMINS e, opcionais, ROBO_MODELO e ROBO_CALVINHO).
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

/** `ROBO_MOTOR=zapgate` no `.env`: o robô fala com o WhatsApp pelo ZapGate em vez da Baileys. */
function usaZapGate(): boolean {
  return process.env.ROBO_MOTOR === 'zapgate';
}

/** Conexão pelo ZapGate (ver docs/zapgate.md). Parear é com o próprio ZapGate: `zapgate pair pelada`. */
async function conectarPeloZapGate(prazoMs?: number, aoReceber?: (m: MensagemRecebida) => void): Promise<WhatsApp> {
  const { conectarMotor } = await import('./whatsapp-zapgate');
  const { ErroFatalWhatsApp } = await import('./whatsapp');
  const arquivo = join(pasta, '.env');
  if (existsSync(arquivo)) process.loadEnvFile(arquivo); // o `configurar` não carrega o banco
  const chave = process.env.ZAPGATE_KEY;
  const segredo = process.env.ZAPGATE_WEBHOOK_SECRET;
  if (!chave || !segredo) {
    parar('Com ROBO_MOTOR=zapgate, o .env do robô precisa de ZAPGATE_KEY e ZAPGATE_WEBHOOK_SECRET (veja docs/zapgate.md).');
  }
  try {
    return await conectarMotor({
      url: process.env.ZAPGATE_URL ?? 'http://127.0.0.1:8787',
      chave: chave!,
      sessao: process.env.ZAPGATE_SESSAO ?? 'pelada',
      portaWebhook: Number(process.env.ZAPGATE_WEBHOOK_PORTA ?? 8788),
      segredoWebhook: segredo!,
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

/** No laço, `prazoMs` evita ficar preso esperando a rede (a volta seguinte tenta de novo). */
async function conectarWhatsApp(mostrarQr: boolean, prazoMs?: number, aoReceber?: (m: MensagemRecebida) => void): Promise<WhatsApp> {
  if (usaZapGate()) return conectarPeloZapGate(prazoMs, aoReceber);
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
  // Com o ZapGate, o pareamento é dele (`zapgate pair pelada`); aqui só se escolhe o grupo.
  if (usaZapGate()) return conectarPeloZapGate();
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
  const urlSite = urlDoSite(process.env);
  // Um cliente da Anthropic para o robô todo; a chave nunca vai para o log.
  const clienteIA = ia ? criarCliente(ia.chave) : null;
  const freio = new Freio(() => new Date());
  // A proposta de times volta do estado depois de um reinício (com os votos e a validade).
  const proposta = { atual: deGuardada(estado.proposta) as Proposta | null };
  let propostaGravada = proposta.atual;
  const anuncio = { atual: anuncioDeGuardado(estado.anuncio) };
  let anuncioGravado = anuncio.atual;
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

  /**
   * Resposta no privado: na própria conversa e a qualquer hora (só responde a quem escreveu). Antes de cada
   * mensagem, "digitando…" por um tempo que cresce com o tamanho (como gente), entre 0,6 e 2,5 s.
   */
  const enviarNoPrivado = (conversa: string) => async (texto: string) => {
    const wa = await conexao!;
    await wa.digitando(conversa);
    await new Promise((ok) => setTimeout(ok, Math.min(2500, 600 + texto.length * 15)));
    await wa.enviar(conversa, texto);
  };

  // A reação que está em cada mensagem (só enquanto ela é tratada): não manda a mesma de novo.
  const reacoes = new Map<string, string>();
  /** Reação na mensagem recebida, sem esperar: uma reação que não sai só fica no log. */
  const reagirEm = (conversa: string, id: string) => (emoji: string) => {
    if ((reacoes.get(id) ?? '') === emoji) return;
    reacoes.set(id, emoji);
    void (async () => {
      const wa = await conexao!;
      await wa.reagir?.(conversa, id, emoji);
    })().catch((err) => log(`reação ${emoji || '(tirar)'} não saiu: ${(err as Error).message}`));
  };

  // A conversa privada de cada organizador: a que ele já usou com o robô ou a que o WhatsApp informa.
  const conversas = new Map<string, string>();
  const conversaDe = async (admin: string): Promise<string | null> => {
    const digitos = admin.replace(/\D/g, '');
    const comDdi = digitos.startsWith('55') ? digitos : `55${digitos}`;
    // Pelo ZapGate, o aviso vai sempre para o telefone: é ele que está em `allow_initiate`
    // (a conversa guardada pode ser um LID, que o ZapGate trataria como contato desconhecido).
    if (usaZapGate()) return `${comDdi}@s.whatsapp.net`;
    for (const [tel, jid] of conversas) if (ehAdmin(tel, [admin])) return jid;
    return (await conexao!).conversaDoTelefone(comDdi);
  };
  /** Um texto no privado de cada organizador (menos `exceto`); falha de um não impede os outros. */
  const avisarOrganizadores = async (texto: string, exceto: string[]) => {
    const wa = await conexao!;
    for (const admin of admins) {
      if (exceto.some((t) => ehAdmin(t, [admin]))) continue;
      try {
        const jid = await conversaDe(admin);
        if (!jid) {
          log('aviso a um organizador não saiu: o número não tem WhatsApp');
          continue;
        }
        await wa.enviar(jid, texto);
      } catch (err) {
        log(`aviso a um organizador não saiu: ${(err as Error).message}`);
      }
    }
  };

  /** Uma linha por pergunta à IA com os tokens gastos (para saber o consumo de verdade). */
  const registrarUso = (u: UsoDaIA) =>
    log(`IA: ${u.entrada + u.cacheLido + u.cacheGravado} tokens de entrada (${u.cacheLido} lidos do cache), ${u.saida} de saída`);
  // A IA parou de vez (sem crédito, chave recusada): o dono (1º número de ROBO_ADMINS) recebe um aviso por dia.
  let diaDoAvisoDaIa = '';
  const avisarIaParada = (motivo: string) => {
    log(`ATENÇÃO: a IA parou (${motivo}); os comandos seguem funcionando.`);
    const hoje = dataDe(new Date());
    if (diaDoAvisoDaIa === hoje || !admins[0]) return;
    diaDoAvisoDaIa = hoje;
    // `exceto` = os outros organizadores: o aviso vai só para o dono, que é quem cuida da chave.
    void avisarOrganizadores(
      `⚠️ A IA do robô parou: ${motivo}. Os comandos continuam funcionando; as perguntas livres respondem que a conversa está de folga. Confira o crédito e o limite de gasto da chave da Anthropic.`,
      admins.slice(1),
    ).catch(() => {});
  };

  // Memória curta de cada privado de organizador (falas e o que dá para desfazer), só enquanto o robô roda.
  const memoria = new ConversasPrivadas();

  /** Trata o pedido e, no fim, nunca deixa a ⌛ da mensagem para trás (ignorada, limite, erro). */
  const tratar = async (m: MensagemRecebida) => {
    try {
      await tratarPedido(m);
    } finally {
      if (m.id) {
        if (reacoes.get(m.id) === '⏳') reagirEm(m.grupoId, m.id)('');
        reacoes.delete(m.id);
      }
    }
  };
  const tratarPedido = async (m: MensagemRecebida) => {
    if (m.privado && m.remetenteTelefone && ehAdmin(m.remetenteTelefone, admins)) conversas.set(m.remetenteTelefone, m.grupoId);
    try {
      const r = await responder(m, {
        estadoGrupoId: grupoId,
        freio,
        admins,
        calvinho: calvinhoDoEnv(process.env),
        apelidos: apelidosDoEnv(process.env),
        ia,
        ultimo: estado.ultimo,
        proposta,
        anuncio,
        // Fora da janela só lê (nunca cria a pelada da semana), como o ensaio.
        lerLista: (n) => (dentroDaJanela(n) ? estadoDaSemana(db, n) : estadoDaSemanaSemCriar(db, n)),
        propor: (n, times, incluirPendentes) => sortearTimesDaNoite(db, n, Math.random, times, incluirPendentes),
        importar: (n, texto) => importarTimesColados(db, n, texto),
        salvar: (n, p) => salvarProposta(db, n, p),
        avisarOrganizadores,
        anunciarNoGrupo: enviarNoGrupo,
        // Lista mandada no grupo pelo privado: vira a última do grupo, como a que sai pela marcação.
        listaMandadaNoGrupo: (g) => {
          if (!podeGravarLista(new Date(), g.foto, estado)) return;
          estado = aposEnvio(estado, new Date(), g.tipo, g.foto);
          gravar(estado);
        },
        // As ações da lista seguem o caminho normal do site (depois da abertura de segunda, criam a pelada se preciso).
        mexerNaLista: (acao, nome, n) => mexerNaLista(db, acao, nome, n),
        memoria,
        desfazer: async (mudancas, n) => {
          for (const x of mudancas) await restaurarPresenca(db, x.peladaId, x.jogadorId, x.antes, n);
        },
        trocarNosTimes: (p, trocas, n) => trocarNaProposta(db, p, trocas, n),
        consultar: (tipo, n) => consultar(db, tipo, n),
        cadastrar: async (pessoas) => respostaCadastro(await cadastrarJogadores(db, pessoas)),
        notas: () => textoDasNotas(db),
        linkAnotar: async (quem, n) => {
          const r = await criarLinkAnotador(db, quem, n);
          return r.ok ? { url: `${urlSite}/anotar/${r.chave}`, data: r.data } : { erro: '📅 A lista da próxima quarta ainda não abriu; o link de anotar sai quando ela abrir.' };
        },
        mudarNota: (nome, nota) => mudarNota(db, nome, nota),
        urlSite,
        // Leitura primeiro, ações depois: a ordem das ferramentas é fixa (prefixo do cache).
        perguntar: (texto, { agora, acoes, quem, ehJonas, jogador, privado, historico }) =>
          perguntarEmPartes(texto, { aoUsar: registrarUso, aoParar: avisarIaParada, chave: ia!.chave, modelo: ia!.modelo, cliente: clienteIA!, ferramentas: [...ferramentasDeLeitura(db, agora, { timesPendentes: () => anuncio.atual !== null || (proposta.atual !== null && !propostaVencida(proposta.atual, agora())) }), ...acoes], agora, quem, ehJonas, jogador, privado, historico }),
        enviar: m.privado ? enviarNoPrivado(m.grupoId) : enviarNoGrupo,
        ...(m.id ? { reagir: reagirEm(m.grupoId, m.id) } : {}),
        log,
      });
      if (proposta.atual !== propostaGravada || anuncio.atual !== anuncioGravado) {
        propostaGravada = proposta.atual;
        anuncioGravado = anuncio.atual;
        estado = { ...estado, proposta: paraGuardar(proposta.atual), anuncio: anuncioParaGuardar(anuncio.atual) };
        gravar(estado);
      }
      if (!r) return;
      log(`respondeu ${m.privado ? 'no privado' : 'a uma marcação'} (${r.texto.split('\n')[0].slice(0, 60)})`);
      if (r.ehListaCompleta && r.gravar && podeGravarLista(new Date(), r.gravar.foto, estado)) {
        estado = aposEnvio(estado, new Date(), r.gravar.tipo, r.gravar.foto);
        gravar(estado);
      }
    } catch (err) {
      log(`erro ao responder (não tenta de novo): ${(err as Error).message}`);
    }
  };
  /** Se o robô vai mesmo atender: só então a ⌛ aparece antes de juntar as mensagens. */
  const vaiAtender = (m: MensagemRecebida) =>
    m.privado ? m.remetenteTelefone !== null && ehAdmin(m.remetenteTelefone, admins) : m.grupoId === grupoId && m.mencionaORobo && !emSilencio(m.quando);
  // Mensagens quebradas da mesma pessoa viram um pedido só (espera uns segundos pelas próximas).
  const juntar = new JuntarMensagens({
    aoComecar: (m) => {
      if (m.id && vaiAtender(m)) reagirEm(m.grupoId, m.id)('⏳');
    },
    aoJuntar: (m) => void emFila(() => tratar(m)),
  });
  const aoReceber = (m: MensagemRecebida) => {
    // Filtro barato antes da fila: só marcação (ou resposta ao robô) começa um pedido; depois, as
    // próximas da mesma pessoa entram nele. A de outro grupo vai ao `responder` só para deixar a
    // linha "marcação ignorada (outro grupo)" no log. No privado não precisa marcar: o `responder`
    // atende só os organizadores.
    juntar.receber(m, m.privado === true || m.mencionaORobo || m.respondeAoRobo);
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
  log(`Respostas: ${ia ? `IA ligada (${ia.modelo})` : 'IA desligada'}; ${admins.length} admin(s) para sortear.`);

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
