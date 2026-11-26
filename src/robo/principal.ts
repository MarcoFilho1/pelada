// Robô do WhatsApp. Uso:
//   pnpm robo                      laço de 1 em 1 minuto (o LaunchAgent roda este)
//   pnpm robo:ensaio [--agora=ISO] [--estado=caminho]   uma decisão, só imprime
//   pnpm robo:configurar [--nome="Outro grupo"]         QR + escolher o grupo
import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, renameSync } from 'node:fs';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { getDb } from '@/db/client';
import { dataDe, proximaQuarta } from '@/domain/tempo';
import { estadoDaPelada, estadoDaSemana, estadoDaSemanaSemCriar, restaurarPresenca } from '@/server/presencas';
import { idDaPeladaDaData } from '@/server/pelada';
import { partidaEmAndamento } from '@/server/partidas';
import { rankingsDaNoite } from '@/server/ranking';
import { decidir, emSilencio } from './agenda';
import { avisoDaBateria, lerBateria, quemAvisarDaBateria } from './bateria';
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
import { apelidosDoEnv, calvinhoDoEnv, configDasRespostas, podeGravarLista, responder, type Cancelamento, type MensagemRecebida } from './responder';
import { anuncioDeGuardado, anuncioParaGuardar, deGuardada, ehAdmin, importarTimesColados, paraGuardar, propostaVencida, salvarProposta, sortearTimesDaNoite, trocarNaProposta, type Proposta } from './sorteio-zap';
import { PedidosDoPrivado } from './juntar';
import { MAX_ANALISES, analisadasHoje, aposLembrar, casarDiarista, cobrancaAtiva, contarAnalise, horaDeAvisarDono, horaDoLembreteDiario, jaPagou, marcarTodos, novaCobranca, proximaManha, quemFalta, registrarPagamento, semLembretes, textoDoLembrete, textoDoLembreteDiario, textoParaODono, type Pix } from './cobranca';
import { lerComprovante } from './comprovante';
import { marcaDe } from '@/domain/lista';
import { fimDePeladaDaVez, paraDeEsperar, textosDoResumo } from './resumo-da-noite';
import { configurarSegunda, horaDeMandarBomDia, textoDoBomDia } from './segunda';
import { umaVolta } from './volta';
import { comEsperaDoLimite } from './limite';
import { PASTA_DO_DIARIO, limparDiario, registrarConversa } from './diario';
import { MIN_FALAS, RECADO_DO_CADERNO, apagarDia, aplicarPendente, aposLer, comSemente, diasParaLer, gravarCaderno, lerCaderno, lerComandoDoCaderno, lerFalas, lerODia, linhasDoCaderno, obedecer, ouvir, textoDoAnuncio } from './caderno';
import { avisoDaRevisao, avisoDoMerge, CaixaDaRevisao, CaixaNoBanco, ehPodeMergear } from './revisao';
import { anotarNoDiario, limparDiarioDoBanco, tirarRecado } from '@/server/ponte-do-robo';
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
/**
 * Com o robô longe do Mac da auto-revisão (num celular), o que ele escreve vai também para o banco,
 * que é a ponte entre os dois (docs/android.md). Ligado no laço, depois que o banco existe.
 */
let espelharNoBanco: ((tipo: 'conversa' | 'log', dados: string, quando: Date) => void) | null = null;
const log = (linha: string) => {
  const agora = new Date();
  console.log(`${hora(agora)} ${linha}`);
  // A volta de cada minuto sem novidade não interessa à revisão.
  if (linha !== 'nada a enviar') espelharNoBanco?.('log', `${hora(agora)} ${linha}`, agora);
};

/** O robô usa o banco como ponte quando não está no Mac, ou quando `ROBO_PONTE=banco` manda. */
function usaPonteNoBanco(): boolean {
  return process.env.ROBO_PONTE === 'banco' || (process.env.ROBO_PONTE !== 'pasta' && process.platform !== 'darwin');
}

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
  configurarSegunda(process.env);
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

/**
 * Dentro da janela, um `caffeinate -i` preso ao nosso pid (morre junto com o robô). Só no Mac:
 * no app Android quem segura o aparelho acordado é o serviço do app (docs/android.md).
 */
function manterAcordado(sim: boolean): void {
  if (process.platform !== 'darwin') return;
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
  // Horários de segunda (lista e bom dia) do .env do robô.
  configurarSegunda(process.env);
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
  // Desde quando este robô guarda estado: o fim de pelada de uma noite anterior não é dele.
  if (!estado.desde) {
    estado = { ...estado, desde: new Date().toISOString() };
    gravar(estado);
  }
  // Uma conexão só, aberta abaixo; mensagens que chegam enquanto ela abre esperam por ela.
  let conexao: Promise<WhatsApp> | null = null;
  /**
   * Resumo e lembrete do fim da pelada, no grupo: à noite até as 23:30 (passam do silêncio das
   * 23:00) ou, se não deu, na manhã seguinte até o meio-dia. `ate`: o fim da janela da vez.
   */
  const enviarNoFimDaPelada = async (texto: string, ate: Date) => {
    const wa = await conexao!;
    if (new Date() >= ate) throw new Error('passou da hora; o fim da pelada não sai mais nesta janela');
    await wa.enviar(grupoId, texto);
  };
  /**
   * O app do celular cria este arquivo enquanto tem partida aberta ou partida anotada que ainda não
   * chegou ao banco (anotação sem internet). Com ele, o resumo espera: sairia sem os gols da noite.
   */
  const arquivoDaAnotacao = process.env.ROBO_ANOTACAO_PENDENTE?.trim() || null;
  const anotacaoPendente = () => arquivoDaAnotacao !== null && existsSync(arquivoDaAnotacao);
  /** Várias mensagens curtas no grupo, exatamente como separadas (pelo ZapGate, uma no limite). */
  const enviarPartesNoGrupo = async (partes: string[]) => {
    const wa = await conexao!;
    if (emSilencio(new Date())) throw new Error('passou das 23:00; a mensagem espera até as 08:00');
    if (wa.enviarCancelavel) await wa.enviarCancelavel(grupoId, partes);
    else await wa.enviar(grupoId, partes.join('\n\n'));
  };
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
  const enviarNoPrivado = (conversa: string) => async (texto: string, op?: { cancelavel?: () => boolean }) => {
    const wa = await conexao!;
    // Pelo ZapGate, ele mesmo "lê" e "digita" (e a mensagem pode ser cancelada até sair).
    if (wa.enviarCancelavel) {
      if (op?.cancelavel) return (await wa.enviarCancelavel(conversa, texto, op.cancelavel)) === 'cancelada' ? 'cancelada' : undefined;
      return wa.enviar(conversa, texto);
    }
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

  /** Pelo ZapGate: as partes da resposta numa entrega só (uma no limite; canceláveis até a 1ª sair). */
  const enviarPartesNoPrivado = (conversa: string) => async (partes: string[], op?: { cancelavel?: () => boolean }) => {
    const wa = await conexao!;
    return (await wa.enviarCancelavel!(conversa, partes, op?.cancelavel)) === 'cancelada' ? ('cancelada' as const) : undefined;
  };

  // A conversa privada de cada organizador: a que ele já usou com o robô ou a que o WhatsApp informa.
  const conversas = new Map<string, string>();
  const conversaDe = async (admin: string): Promise<string | null> => {
    const digitos = admin.replace(/\D/g, '');
    const comDdi = digitos.startsWith('55') ? digitos : `55${digitos}`;
    // Pelo ZapGate, o aviso vai sempre para o telefone: é ele que está em `allow_initiate`
    // (a conversa guardada pode ser um LID, que o ZapGate trataria como contato desconhecido).
    // Mas o endereço de verdade: número antigo registrado sem o 9 recebe nada no endereço com o 9
    // (o servidor aceita e a mensagem fica em "enviada" para sempre).
    if (usaZapGate()) return (await (await conexao!).conversaDoTelefone(comDdi).catch(() => null)) ?? `${comDdi}@s.whatsapp.net`;
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
        // O limite por hora recusou? O aviso espera a vaga e sai depois, em vez de se perder
        // (os avisos já saem em segundo plano: esperar aqui não segura a resposta de ninguém).
        await comEsperaDoLimite(() => wa.enviar(jid, texto), {
          aoEsperar: (tipo, ms) => log(`aviso a um organizador segurado pelo limite (por ${tipo}); tenta de novo em ${Math.round(ms / 1000)} s`),
        });
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

  // ---- Bateria baixa do aparelho (só no celular: o app escreve o arquivo de `ROBO_BATERIA`) ----
  const arquivoDaBateria = process.env.ROBO_BATERIA?.trim() || null;
  // O dono (1º de ROBO_ADMINS) e quem mais estiver em ROBO_BATERIA_AVISAR (quem anda com o aparelho).
  const avisadosDaBateria = [...new Set([...(admins[0] ? [admins[0].replace(/\D/g, '')] : []), ...quemAvisarDaBateria(process.env)])];
  let degrauAvisado: number | null = null;
  let falhaDaBateria = '';
  const talvezBateria = async (now: Date) => {
    if (!arquivoDaBateria || !avisadosDaBateria.length || !existsSync(arquivoDaBateria)) return;
    const leitura = lerBateria(readFileSync(arquivoDaBateria, 'utf8'), now.getTime());
    if (!leitura) return;
    const r = avisoDaBateria(leitura, degrauAvisado);
    if (!r.texto) {
      degrauAvisado = r.avisado;
      return;
    }
    // Entre 23:00 e 08:00 o ZapGate recusa mensagem que o robô começa: o aviso sai de manhã, com o nível da hora.
    if (emSilencio(now)) return;
    const wa = await conexao!;
    let saiu = 0;
    let motivo = '';
    for (const numero of avisadosDaBateria) {
      try {
        const jid = await conversaDe(numero);
        if (!jid) throw new Error('o número não tem WhatsApp');
        await wa.enviar(jid, r.texto);
        saiu++;
      } catch (err) {
        motivo = (err as Error).message;
      }
    }
    // Se não saiu para ninguém, tenta de novo na próxima volta (uma linha só no registro por motivo).
    if (!saiu) {
      if (falhaDaBateria !== motivo) log(`bateria em ${leitura.nivel}%: o aviso não saiu (${motivo}); tenta de novo`);
      falhaDaBateria = motivo;
      return;
    }
    falhaDaBateria = '';
    degrauAvisado = r.avisado;
    log(`bateria em ${leitura.nivel}%: aviso mandado a ${saiu} de ${avisadosDaBateria.length}`);
  };

  // ---- Auto-revisão: avisos ao dono e o "pode mergear" ----
  const noCelular = usaPonteNoBanco();
  const caixa = noCelular ? new CaixaNoBanco(db, () => new Date()) : new CaixaDaRevisao(join(homedir(), 'Library/Logs/PeladaRobo/revisao'), () => new Date());
  if (noCelular) {
    // Nunca atrapalha o robô: uma linha que não foi para o banco só deixa a revisão com menos contexto.
    espelharNoBanco = (tipo, dados, quando) => void anotarNoDiario(db, tipo, dados, quando).catch((err) => console.error(`ponte: não anotei no banco (${(err as Error).message})`));
    log('ponte com o Mac pelo banco: conversas, registro e recados da revisão');
  }
  /** Mensagens ao dono (1º de ROBO_ADMINS), numa entrega só pelo ZapGate; lança se não saiu. */
  const avisarDono = async (partes: string[]) => {
    const wa = await conexao!;
    const jid = admins[0] ? await conversaDe(admins[0]) : null;
    if (!jid) throw new Error('sem conversa com o dono');
    if (wa.enviarCancelavel) await wa.enviarCancelavel(jid, partes);
    else for (const p of partes) await wa.enviar(jid, p);
  };
  // Entre 23:00 e 08:00 o ZapGate recusa mensagem que o robô começa (anti-ban): os avisos esperam a manhã.
  const conferirRevisao = async (now: Date) => {
    if (emSilencio(now)) return;
    const r = await caixa.novoResultado();
    if (r) {
      try {
        await avisarDono(avisoDaRevisao(r));
        log(`revisão: aviso mandado ao dono (${r.status}${r.pr ? `, PR #${r.pr}` : ''})`);
      } catch (err) {
        await caixa.devolverResultado(r);
        log(`revisão: aviso não saiu (tenta na próxima volta): ${(err as Error).message}`);
      }
    }
    const mg = await caixa.resultadoDoMerge();
    if (mg) {
      log(`revisão: merge do PR #${mg.pr} ${mg.status === 'ok' ? 'ok' : `falhou (${mg.motivo})`}`);
      try {
        await avisarDono([avisoDoMerge(mg, noCelular)]);
      } catch (err) {
        await caixa.devolverMerge(mg);
        log(`revisão: aviso do merge não saiu (tenta na próxima volta): ${(err as Error).message}`);
      }
    }
  };
  // ---- O caderno da resenha (caderno.ts): ouvir o grupo de dia, ler à noite, contar ao dono de manhã ----
  // Ligado quando há IA; `ROBO_CADERNO=0` desliga. Fica na pasta do robô: as falas do dia são apagadas depois de lidas.
  const cadernoLigado = !!ia && !!clienteIA && process.env.ROBO_CADERNO?.trim() !== '0';
  const arquivoDoCaderno = join(pasta, 'caderno.json');
  const pastaDoOuvido = join(pasta, 'ouvido');
  let caderno = lerCaderno(arquivoDoCaderno);
  const guardarCaderno = (novo: typeof caderno) => {
    caderno = novo;
    try {
      gravarCaderno(arquivoDoCaderno, novo);
    } catch (err) {
      log(`caderno: não gravou (${(err as Error).message})`);
    }
  };
  // Depois de uma falha (IA fora, dono sem conversa), espera meia hora: o laço roda de minuto em minuto.
  let cadernoSoDepoisDe = 0;
  let recadoDoCadernoVistoEm = 0;
  const talvezCaderno = async (now: Date) => {
    if (!cadernoLigado || now.getTime() < cadernoSoDepoisDe) return;
    // Linhas que o Mac deixou no banco (a importação de uma conversa antiga): confere de 5 em 5 minutos.
    if (now.getTime() - recadoDoCadernoVistoEm >= 5 * 60_000) {
      recadoDoCadernoVistoEm = now.getTime();
      const recado = await tirarRecado(db, RECADO_DO_CADERNO).catch(() => null);
      if (recado) {
        try {
          const dados = JSON.parse(recado) as { dia?: unknown };
          const antes = caderno.pendente?.novas.length ?? 0;
          guardarCaderno(comSemente(caderno, typeof dados.dia === 'string' ? dados.dia : dataDe(now), dados));
          log(`caderno: ${(caderno.pendente?.novas.length ?? 0) - antes} linha(s) chegaram do Mac`);
        } catch (err) {
          log(`caderno: recado do Mac estragado, ignorado (${(err as Error).message})`);
        }
      }
    }
    const dia = diasParaLer(pastaDoOuvido, now, caderno.lido)[0];
    if (dia) {
      const falas = lerFalas(pastaDoOuvido, dia);
      try {
        const proposta = falas.length < MIN_FALAS ? { novas: [], tirar: [] } : await lerODia(clienteIA!, ia!.modelo || 'claude-haiku-5-5', caderno.notas, falas, dia, registrarUso);
        guardarCaderno(aposLer(caderno, dia, proposta));
        apagarDia(pastaDoOuvido, dia);
        log(`caderno: li ${falas.length} fala(s) de ${dia}: ${proposta.novas.length} linha(s) nova(s), ${proposta.tirar.length} para tirar`);
      } catch (err) {
        cadernoSoDepoisDe = now.getTime() + 30 * 60_000;
        log(`caderno: a leitura de ${dia} falhou (tento em 30 min): ${(err as Error).message}`);
        return;
      }
    }
    // O que a IA propôs só vale depois que o dono recebeu o aviso; de madrugada o aviso espera as 08:00.
    const aviso = textoDoAnuncio(caderno);
    if (caderno.pendente && !aviso) guardarCaderno(aplicarPendente(caderno));
    if (!aviso || emSilencio(now)) return;
    try {
      await avisarDono([aviso]);
      guardarCaderno(aplicarPendente(caderno));
      log(`caderno: aviso mandado ao dono; ${caderno.notas.length} linha(s) valendo`);
    } catch (err) {
      cadernoSoDepoisDe = now.getTime() + 30 * 60_000;
      log(`caderno: o aviso ao dono não saiu (tento em 30 min): ${(err as Error).message}`);
    }
  };
  /** "caderno", "caderno tira 2": só o dono, no privado. */
  const talvezComandoDoCaderno = (m: MensagemRecebida): string | null => {
    if (!cadernoLigado || !m.privado || !m.remetenteTelefone || !admins[0] || !ehAdmin(m.remetenteTelefone, [admins[0]])) return null;
    const cmd = lerComandoDoCaderno(m.texto);
    if (!cmd) return null;
    const r = obedecer(caderno, cmd);
    guardarCaderno(r.caderno);
    if (cmd.tipo !== 'ver') log(`caderno: o dono mandou tirar; ficaram ${r.caderno.notas.length} linha(s)`);
    return r.resposta;
  };

  /** "pode mergear" do dono no privado, com revisão pendente: solta o script de merge, que sobrevive ao reinício. */
  const talvezMergear = async (m: MensagemRecebida): Promise<string | null> => {
    if (!m.privado || !m.remetenteTelefone || !admins[0] || !ehAdmin(m.remetenteTelefone, [admins[0]]) || !ehPodeMergear(m.texto)) return null;
    const pr = await caixa.comecarMerge();
    if (pr === null) return null;
    if (noCelular) {
      // Longe do Mac, o robô só deixa o pedido no banco: quem junta é o Mac, que confere a cada 5 minutos.
      log(`revisão: "pode mergear" do dono; pedido de juntar o PR #${pr} deixado para o Mac`);
      return `⏳ Pedi para juntar o PR #${pr}: o Mac roda os testes e junta em alguns minutos. Te aviso quando terminar.`;
    }
    const saida = openSync(join(homedir(), 'Library/Logs/PeladaRobo/revisao.log'), 'a');
    try {
      const filho = spawn('/bin/zsh', [join(process.cwd(), 'scripts/revisao/mergear.sh'), String(pr)], { detached: true, stdio: ['ignore', saida, saida] });
      filho.on('error', (err) => log(`revisão: o script de merge não abriu: ${err.message}`));
      filho.unref();
    } finally {
      closeSync(saida);
    }
    log(`revisão: "pode mergear" do dono; juntando o PR #${pr}`);
    return `⏳ Juntando o PR #${pr}: rodo os testes, junto e me reinicio. Te aviso quando voltar.`;
  };

  // Memória curta de cada privado de organizador (falas e o que dá para desfazer), só enquanto o robô roda.
  const memoria = new ConversasPrivadas();

  /**
   * Trata o pedido e, no fim, nunca deixa a ⌛ da mensagem para trás (ignorada, limite, erro), a não
   * ser que a resposta tenha sido descartada para refazer com a mensagem nova (aí a ⌛ continua).
   */
  const tratar = async (m: MensagemRecebida, cancelar?: Cancelamento) => {
    try {
      await tratarPedido(m, cancelar);
    } finally {
      if (m.id && !cancelar?.cancelou) {
        if (reacoes.get(m.id) === '⏳') reagirEm(m.grupoId, m.id)('');
        reacoes.delete(m.id);
      }
    }
  };
  const tratarPedido = async (m: MensagemRecebida, cancelar?: Cancelamento) => {
    if (m.privado && m.remetenteTelefone && ehAdmin(m.remetenteTelefone, admins)) conversas.set(m.remetenteTelefone, m.grupoId);
    // O que de fato saiu, para o diário das conversas (a auto-revisão lê).
    const enviado: string[] = [];
    const anotar = (erro?: string) => {
      const entrada = { quando: m.quando.toISOString(), onde: m.privado ? ('privado' as const) : ('grupo' as const), quem: m.remetenteNome, recebido: m.texto, enviado, ...(erro ? { erro } : {}) };
      registrarConversa(PASTA_DO_DIARIO, entrada);
      espelharNoBanco?.('conversa', JSON.stringify(entrada), m.quando);
    };
    const enviar = m.privado ? enviarNoPrivado(m.grupoId) : enviarNoGrupo;
    const enviarPartes = m.privado ? enviarPartesNoPrivado(m.grupoId) : (partes: string[]) => enviarPartesNoGrupo(partes);
    try {
      const mergeando = await talvezMergear(m);
      if (mergeando) {
        await enviar(mergeando);
        enviado.push(mergeando);
        anotar();
        return;
      }
      const doCaderno = talvezComandoDoCaderno(m);
      if (doCaderno) {
        await enviar(doCaderno);
        enviado.push(doCaderno);
        anotar();
        return;
      }
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
        ...(usaZapGate() ? { anunciarPartesNoGrupo: enviarPartesNoGrupo } : {}),
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
          perguntarEmPartes(texto, { aoUsar: registrarUso, aoParar: avisarIaParada, chave: ia!.chave, modelo: ia!.modelo, cliente: clienteIA!, caderno: cadernoLigado ? linhasDoCaderno(caderno) : undefined, ferramentas: [...ferramentasDeLeitura(db, agora, { timesPendentes: () => anuncio.atual !== null || (proposta.atual !== null && !propostaVencida(proposta.atual, agora())) }), ...acoes], agora, quem, ehJonas, jogador, privado, historico }),
        enviar: async (texto: string, op?: { cancelavel?: () => boolean }) => {
          const r = await enviar(texto, op);
          if (r !== 'cancelada') enviado.push(texto);
          return r;
        },
        // Pelo ZapGate, as partes saem numa entrega só (uma no limite), no privado e no grupo.
        ...(usaZapGate()
          ? {
              enviarPartes: async (partes: string[], op?: { cancelavel?: () => boolean }) => {
                const r = await enviarPartes(partes, op);
                if (r !== 'cancelada') enviado.push(...partes);
                return r;
              },
            }
          : {}),
        ...(m.id ? { reagir: reagirEm(m.grupoId, m.id) } : {}),
        ...(cancelar ? { cancelar } : {}),
        pix: pixDosOrganizadores,
        log,
      });
      if (proposta.atual !== propostaGravada || anuncio.atual !== anuncioGravado) {
        propostaGravada = proposta.atual;
        anuncioGravado = anuncio.atual;
        estado = { ...estado, proposta: paraGuardar(proposta.atual), anuncio: anuncioParaGuardar(anuncio.atual) };
        gravar(estado);
      }
      if (!r) return;
      anotar();
      log(`respondeu ${m.privado ? 'no privado' : 'a uma marcação'} (${r.texto.split('\n')[0].slice(0, 60)})`);
      if (r.ehListaCompleta && r.gravar && podeGravarLista(new Date(), r.gravar.foto, estado)) {
        estado = aposEnvio(estado, new Date(), r.gravar.tipo, r.gravar.foto);
        gravar(estado);
      }
    } catch (err) {
      anotar((err as Error).message);
      log(`erro ao responder (não tenta de novo): ${(err as Error).message}`);
    }
  };
  // Privado: a ⌛ aparece já na primeira mensagem (só para organizador, que é quem o robô atende).
  const pedidosDoPrivado = new PedidosDoPrivado({
    agendar: (tarefa) => void emFila(tarefa),
    tratar,
    aoComecar: (m) => {
      if (m.id && m.remetenteTelefone !== null && ehAdmin(m.remetenteTelefone, admins)) reagirEm(m.grupoId, m.id)('⏳');
    },
  });
  // ---- Pix dos diaristas: lembrete no fim da pelada, comprovantes no grupo, aviso ao dono ----
  const pix: Pix | null = process.env.ROBO_PIX_VALOR && process.env.ROBO_PIX_CHAVE ? { valor: process.env.ROBO_PIX_VALOR, chave: process.env.ROBO_PIX_CHAVE } : null;
  const dono = (process.env.ROBO_DONO ?? '').replace(/\D/g, '');
  const telefoneDoDono = dono ? (dono.startsWith('55') ? dono : `55${dono}`) : null;
  // O endereço de verdade do dono no WhatsApp: muito número antigo está registrado sem o 9, e uma
  // mensagem para o endereço com o 9 é aceita pelo servidor mas não chega a ninguém.
  let conversaDoDono: string | null = null;
  const enderecoDoDono = async (): Promise<string | null> => {
    if (!telefoneDoDono) return null;
    conversaDoDono ??= await (await conexao!).conversaDoTelefone(telefoneDoDono);
    return conversaDoDono;
  };
  const apelidos = apelidosDoEnv(process.env);
  // Grupo extra onde comprovantes também valem (ex.: o organizador encaminha um comprovante para o
  // grupo de teste). E um telefone que recebe uma cópia de cada aviso do Pix mandado ao dono.
  const grupoDeTesteDoPix = process.env.ROBO_PIX_GRUPO_EXTRA?.trim() || null;
  const telefoneDaCopia = (process.env.ROBO_PIX_COPIA ?? '').replace(/\D/g, '');
  let conversaDaCopia: string | null = null;

  /** Foto ou PDF no grupo enquanto o Pix da noite está aberto: a IA confere; comprovante ganha ✅. */
  const talvezComprovante = async (m: MensagemRecebida) => {
    const c = estado.cobranca;
    const now = new Date();
    if (!m.midia || !m.id || !cobrancaAtiva(c, now)) return;
    if (!ia || !clienteIA) return log('comprovante: a IA está desligada, não dá para conferir a imagem');
    if (analisadasHoje(c, now) >= MAX_ANALISES) return log(`comprovante: já olhei ${MAX_ANALISES} imagens hoje; esta fica sem conferir`);
    const telefoneDoJogador = m.remetenteTelefone ? apelidos.find((a) => ehAdmin(m.remetenteTelefone!, [a.telefone]))?.nome : null;
    // Quem já pagou pode mandar foto à vontade (resenha, print): não gasta IA.
    const pelosNomes = casarDiarista(c, [telefoneDoJogador, m.remetenteNome]);
    if (pelosNomes && jaPagou(c, pelosNomes.jogadorId)) return;
    const wa = await conexao!;
    if (!wa.baixarMidia) return;
    const arquivo = await wa.baixarMidia(m.midia.id);
    const leitura = await lerComprovante(clienteIA, ia.modelo || 'claude-haiku-5-5', arquivo.bytes, m.midia.mime ?? arquivo.mime, registrarUso);
    // Sobre o estado de agora: a leitura demora, e outra coisa pode ter mudado a cobrança no meio.
    estado = { ...estado, cobranca: contarAnalise(estado.cobranca ?? c, now) };
    gravar(estado);
    if (!leitura.ehComprovante) return;
    const atual = estado.cobranca!;
    const d = pelosNomes ?? casarDiarista(atual, [leitura.pagador]);
    reagirEm(m.grupoId, m.id)('✅');
    reacoes.delete(m.id);
    if (d && jaPagou(atual, d.jogadorId)) return;
    const nome = d?.nome ?? m.remetenteNome?.trim() ?? 'alguém';
    estado = {
      ...estado,
      cobranca: registrarPagamento(atual, { jogadorId: d?.jogadorId ?? null, nome, quando: now.toISOString(), mensagemId: m.id, pagador: leitura.pagador, valor: leitura.valor }, now),
    };
    gravar(estado);
    log(`comprovante de ${nome}${d ? '' : ' (não sei qual diarista é)'}`);
  };

  /**
   * O lembrete do Pix para os diaristas da lista: logo depois do resumo da noite ou, se o resumo
   * ficou esperando uma partida aberta, a partir das 22:55 de qualquer jeito. Se a noite passou sem
   * ele sair (celular sem internet), sai na manhã seguinte, depois do resumo.
   */
  const talvezLembrete = async (now: Date) => {
    const vez = pix ? fimDePeladaDaVez(now, estado.lembreteEnviado, estado.desde) : null;
    if (!pix || !vez) return;
    const hoje = vez.data;
    // Depois do resumo. Sem resumo: à noite, a partir das 22:55; de manhã, 20 minutos depois das 8h.
    const semEsperar = vez.ontem ? new Date(vez.ate.getTime() - 220 * 60_000) : paraDeEsperar(hoje);
    if (estado.resumoEnviado !== hoje && now < semEsperar) return;
    const marcar = (cobranca?: ReturnType<typeof novaCobranca>) => {
      estado = { ...estado, lembreteEnviado: hoje, ...(cobranca ? { cobranca } : {}) };
      gravar(estado);
    };
    const peladaId = await idDaPeladaDaData(db, hoje);
    if (peladaId === null) return marcar();
    // A lista desta pelada (depois das 22:30, "a da semana" já é a da quarta seguinte).
    const lista = await estadoDaPelada(db, peladaId, now);
    if (lista.cancelada) return marcar();
    const diaristas = lista.principal.filter((i) => marcaDe(i) === 'D').map((i) => ({ jogadorId: i.jogadorId, nome: i.nome }));
    if (!diaristas.length) {
      log('lembrete do Pix: nenhum diarista na lista de hoje');
      return marcar();
    }
    await enviarNoFimDaPelada(textoDoLembrete(diaristas, pix, vez.ontem), vez.ate);
    marcar(novaCobranca(hoje, diaristas));
    log(`lembrete do Pix mandado (${diaristas.length} diaristas${vez.ontem ? ', da pelada de ontem' : ''})`);
  };

  /**
   * Todo dia, do dia seguinte à pelada até o fim do prazo, lembra no grupo quem ainda não pagou.
   * Para quando todos pagam ou quando um organizador manda parar, no privado.
   */
  const talvezLembreteDiario = async (now: Date) => {
    const c = estado.cobranca;
    if (!pix || !horaDoLembreteDiario(c, now)) return;
    await (await conexao!).enviar(grupoId, textoDoLembreteDiario(c, pix));
    estado = { ...estado, cobranca: aposLembrar(estado.cobranca ?? c, now) };
    gravar(estado);
    log(`lembrete diário do Pix mandado (faltam ${quemFalta(c).length})`);
  };

  /** Quem pagou e quem falta, no privado do dono; de madrugada, guarda para a manhã. */
  const talvezAvisarDono = async (now: Date) => {
    const c = estado.cobranca;
    if (!telefoneDoDono || !c || !horaDeAvisarDono(c, now)) return;
    try {
      const destino = await enderecoDoDono();
      if (!destino) throw new Error('o número do dono (ROBO_DONO) não tem WhatsApp');
      await (await conexao!).enviar(destino, textoParaODono(c));
      estado = { ...estado, cobranca: { ...c, avisarDonoEm: null } };
      log('aviso do Pix mandado ao dono da pelada');
      // A cópia (para quem acompanha) não atrasa nem desfaz o aviso: falha só fica no log.
      if (telefoneDaCopia) {
        try {
          const wa = await conexao!;
          conversaDaCopia ??= await wa.conversaDoTelefone(telefoneDaCopia.startsWith('55') ? telefoneDaCopia : `55${telefoneDaCopia}`);
          if (conversaDaCopia) await wa.enviar(conversaDaCopia, `(cópia do aviso ao dono)\n${textoParaODono(c)}`);
        } catch (err) {
          log(`cópia do aviso do Pix não saiu: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      const msg = (err as Error).message;
      const depois = /quiet_hours/.test(msg) ? proximaManha(now) : new Date(now.getTime() + 5 * 60_000);
      estado = { ...estado, cobranca: { ...c, avisarDonoEm: depois.toISOString() } };
      log(`aviso do Pix ao dono não saiu (${msg}); tenta de novo às ${depois.toISOString().slice(11, 16)} UTC`);
    }
    gravar(estado);
  };

  /** O Pix para os organizadores no privado: a situação e marcar um pagamento na mão. */
  const pixDosOrganizadores = {
    situacao: () => (cobrancaAtiva(estado.cobranca, new Date()) ? textoParaODono(estado.cobranca) : null),
    marcar: (nome: string, now: Date) => {
      const c = estado.cobranca;
      if (!cobrancaAtiva(c, now)) return 'Não tem cobrança de Pix aberta agora.';
      const d = casarDiarista(c, [nome]);
      if (!d) return `Não achei ${nome} entre os diaristas: ${c.diaristas.map((x) => x.nome).join(', ')}.`;
      if (jaPagou(c, d.jogadorId)) return `${d.nome} já estava marcado como pago.`;
      estado = { ...estado, cobranca: registrarPagamento(c, { jogadorId: d.jogadorId, nome: d.nome, quando: now.toISOString(), mensagemId: 'manual' }, now) };
      gravar(estado);
      log(`pagamento do Pix marcado na mão: ${d.nome}`);
      return `✅ ${d.nome} marcado como pago.`;
    },
    todosPagaram: (now: Date) => {
      const c = estado.cobranca;
      if (!cobrancaAtiva(c, now)) return 'Não tem cobrança de Pix aberta agora.';
      const faltavam = quemFalta(c);
      if (!faltavam.length) return 'Todo mundo já estava marcado como pago.';
      estado = { ...estado, cobranca: marcarTodos(c, now) };
      gravar(estado);
      log(`Pix: um organizador disse que todos pagaram (${faltavam.length} marcado(s) na mão)`);
      return `✅ Marquei como pago: ${faltavam.map((d) => d.nome).join(', ')}. Não mando mais lembrete desta pelada.`;
    },
    pararLembretes: (now: Date) => {
      const c = estado.cobranca;
      if (!cobrancaAtiva(c, now)) return 'Não tem cobrança de Pix aberta agora.';
      if (c.semLembrete) return 'Os lembretes do Pix desta pelada já estavam parados.';
      estado = { ...estado, cobranca: semLembretes(c) };
      gravar(estado);
      log('Pix: um organizador mandou parar os lembretes diários');
      return '🔕 Parei os lembretes do Pix desta pelada. Comprovante mandado no grupo continua valendo.';
    },
  };

  const aoReceber = (m: MensagemRecebida) => {
    // O ouvido do caderno: tudo o que o grupo escreve, com ou sem marcação. O robô só guarda; não responde por isso.
    if (cadernoLigado && !m.privado && m.grupoId === grupoId && m.texto.trim()) ouvir(pastaDoOuvido, { quando: m.quando, quem: m.remetenteNome, texto: m.texto });
    // Foto ou PDF no grupo (sem marcar o robô): pode ser comprovante de Pix.
    const grupoDoPix = m.grupoId === grupoId || (grupoDeTesteDoPix !== null && m.grupoId === grupoDeTesteDoPix);
    if (m.midia && !m.privado && grupoDoPix && !m.mencionaORobo && !m.respondeAoRobo) {
      void emFila(() => talvezComprovante(m)).catch((err) => log(`comprovante: ${(err as Error).message}`));
      return;
    }
    // Mídia sem texto (no privado ou com marcação): nada para responder.
    if (m.midia && !m.texto.trim()) return;
    // No privado não precisa marcar (o `responder` atende só os organizadores); mensagens seguidas
    // da mesma pessoa viram um pedido só. No grupo, só marcação (ou resposta ao robô), cada uma
    // sozinha; a de outro grupo vai ao `responder` só para deixar a linha "marcação ignorada" no log.
    if (m.privado) pedidosDoPrivado.receber(m);
    else if (m.mencionaORobo || m.respondeAoRobo) void emFila(() => tratar(m));
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

  /**
   * O resumo do fim da pelada (22:35–22:40): destaques da noite e depois as tabelas gerais, uma
   * mensagem cada. Espera a partida em andamento terminar (até as 22:55) e a anotação feita no app
   * chegar ao banco (até o fim da janela). Conta como mandado assim que a primeira mensagem sai:
   * repetir o resumo seria pior que uma tabela faltando. Se a noite passou sem ele sair, sai na
   * manhã seguinte (8h ao meio-dia), como "ontem".
   */
  let esperandoPartida = false;
  let esperandoAnotacao = false;
  const talvezResumo = async (now: Date) => {
    const vez = fimDePeladaDaVez(now, estado.resumoEnviado, estado.desde);
    if (!vez) return;
    const hoje = vez.data;
    if (anotacaoPendente()) {
      if (!esperandoAnotacao) log('resumo: esperando a anotação feita no app chegar ao banco');
      esperandoAnotacao = true;
      return;
    }
    esperandoAnotacao = false;
    const marcar = () => {
      estado = { ...estado, resumoEnviado: hoje };
      gravar(estado);
    };
    const peladaId = await idDaPeladaDaData(db, hoje);
    if (peladaId === null) return marcar();
    // Partida aberta: espera terminar, mas só até 22:55 (alguém pode ter esquecido de encerrar).
    if (!vez.ontem && now < paraDeEsperar(hoje) && (await partidaEmAndamento(db, peladaId)) !== null) {
      if (!esperandoPartida) log('resumo da noite: esperando a partida em andamento terminar');
      esperandoPartida = true;
      return;
    }
    esperandoPartida = false;
    const { hoje: daNoite, geral } = await rankingsDaNoite(db, hoje);
    const textos = textosDoResumo(daNoite, geral, vez.ontem);
    if (!textos.length) {
      log('resumo da noite: nenhuma partida com gol ou vitória hoje; não manda');
      return marcar();
    }
    for (const [i, texto] of textos.entries()) {
      try {
        await enviarNoFimDaPelada(texto, vez.ate);
      } catch (err) {
        log(`resumo da noite: a mensagem ${i + 1} de ${textos.length} não saiu (${(err as Error).message})`);
        if (i === 0) return; // nada saiu: tenta de novo no próximo minuto (até o fim da janela)
        continue;
      }
      if (i === 0) marcar();
    }
    log(`resumo ${vez.ontem ? 'da pelada de ontem' : 'da noite'} mandado (${textos.length} mensagens)`);
  };

  let estavaDentro: boolean | null = null;
  let diaDaLimpeza = '';
  for (;;) {
    const now = new Date();
    await emFila(() => conferirRevisao(now)).catch((err) => log(`revisão: ${(err as Error).message}`));
    // Diário das conversas: uma limpeza por dia (na partida e na virada), fica só a última semana.
    if (diaDaLimpeza !== dataDe(now)) {
      diaDaLimpeza = dataDe(now);
      const apagados = limparDiario(PASTA_DO_DIARIO, now);
      if (espelharNoBanco) void limparDiarioDoBanco(db, now).catch(() => {});
      if (apagados.length) log(`diário: apagados ${apagados.length} dia(s) com mais de 7 dias`);
    }
    await emFila(() => talvezResumo(now)).catch((err) => log(`resumo da noite falhou: ${(err as Error).message}`));
    await emFila(() => talvezLembrete(now)).catch((err) => log(`lembrete do Pix falhou: ${(err as Error).message}`));
    await emFila(() => talvezLembreteDiario(now)).catch((err) => log(`lembrete diário do Pix falhou: ${(err as Error).message}`));
    await emFila(() => talvezAvisarDono(now)).catch((err) => log(`aviso do Pix falhou: ${(err as Error).message}`));
    await emFila(() => talvezBateria(now)).catch((err) => log(`aviso de bateria falhou: ${(err as Error).message}`));
    await emFila(() => talvezCaderno(now)).catch((err) => log(`caderno falhou: ${(err as Error).message}`));
    const dentro = dentroDaJanela(now);
    if (!dentro) {
      manterAcordado(false);
      // Uma linha só ao sair da janela (não uma por minuto a semana toda).
      if (estavaDentro !== false) log(`fora da janela (só responde marcações); próxima começa ${hora(proximaJanela(now))}`);
    } else {
      if (estavaDentro !== true) log(process.platform === 'darwin' ? 'janela aberta: o Mac fica acordado até quarta 20:30.' : 'janela aberta até quarta 20:30.');
      manterAcordado(true);
      await emFila(async () => {
        // Bom dia de segunda, antes da primeira lista (só se ROBO_BOM_DIA_HORARIO estiver configurado).
        const quarta = proximaQuarta(now);
        if (horaDeMandarBomDia(now, quarta, estado.bomDiaEnviado)) {
          try {
            await enviarPartesNoGrupo(textoDoBomDia(quarta).split('\n\n'));
            estado = { ...estado, bomDiaEnviado: quarta };
            gravar(estado);
            log('bom dia de segunda mandado');
          } catch (err) {
            log(`bom dia de segunda não saiu (tenta de novo no próximo minuto): ${(err as Error).message}`);
          }
        }
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
