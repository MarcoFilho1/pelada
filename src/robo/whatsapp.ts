// Tudo o que fala com o WhatsApp (Baileys) fica aqui. O principal.ts só importa este arquivo de
// forma dinâmica no caminho de verdade, para o ensaio rodar sem carregar a Baileys.
import type { proto, WAMessageKey, WASocket } from 'baileys';
import qrcode from 'qrcode-terminal';

export type Grupo = { id: string; nome: string; participantes: number };

export interface WhatsApp {
  gruposChamados(nome: string): Promise<Grupo[]>;
  /** Resolve só quando o servidor do WhatsApp devolveu o ack desta mensagem. */
  enviar(grupoId: string, texto: string): Promise<void>;
  fechar(): Promise<void>;
}

/** Problema que reconectar não resolve: o robô deve parar. */
export class ErroFatalWhatsApp extends Error {}

export const MSG_DESLOGADO = 'Sessão do WhatsApp desconectada. Leia o QR de novo com `pnpm robo:configurar`.';
const MSG_SUBSTITUIDA = 'Outra conexão com este número tomou o lugar do robô (outro `pnpm robo` ou `pnpm robo:configurar` rodando?). O robô parou.';

export type OpcoesConexao = {
  pastaAuth: string;
  /** `true` só no `robo:configurar`. No laço, pedir QR = sessão perdida = erro fatal. */
  mostrarQr: boolean;
  /** Desiste (e fecha) se a primeira conexão não abrir neste tempo. Sem valor: espera o quanto for. */
  prazoMs?: number;
  log: (linha: string) => void;
  /** Chamado uma vez se a sessão cair de vez depois de conectada. */
  aoFalhar?: (erro: ErroFatalWhatsApp) => void;
};

const ESPERA_ENVIO_MS = 60_000;
// Códigos de DisconnectReason (Baileys).
const DESLOGADO = 401;
const SUBSTITUIDA = 440;
const REINICIAR = 515;

function comPrazo<T>(promessa: Promise<T>, ms: number, oQue: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const prazo = new Promise<never>((_, rejeitar) => {
    timer = setTimeout(() => rejeitar(new Error(`${oQue}: sem resposta em ${ms / 1000} s`)), ms);
  });
  return Promise.race([promessa, prazo]).finally(() => clearTimeout(timer));
}

/** O mínimo do socket da Baileys que o envio usa (permite testar sem WhatsApp). */
export type SocketDeEnvio = {
  ws: {
    on(evento: string, ouvinte: (no: { attrs: Record<string, string | undefined> }) => void): unknown;
    off(evento: string, ouvinte: (no: { attrs: Record<string, string | undefined> }) => void): unknown;
  };
  sendMessage(jid: string, conteudo: { text: string }, opcoes: { messageId: string }): Promise<{ message?: proto.IMessage | null } | undefined>;
};

// O servidor responde cada mensagem com <ack class="message" id="…"> (com `error` se recusou).
// A Baileys repassa isso no ws como 'CB:ack,class:message' (socket.js, prefixo DEF_CALLBACK_PREFIX).
export const EVENTO_ACK = 'CB:ack,class:message';
export const MSG_SEM_ACK = 'O servidor do WhatsApp não confirmou a mensagem a tempo; ela pode ter saído e, na próxima volta, pode sair duplicada.';

/**
 * Envia e só resolve quando chega o ack do servidor para este id. O `sendMessage` da Baileys
 * resolve assim que o quadro é escrito no socket local (e o id é gerado aqui), então não serve
 * de confirmação: com a rede caída e o socket meio aberto, a mensagem se perderia em silêncio.
 */
export async function enviarComConfirmacao(
  sock: SocketDeEnvio,
  grupoId: string,
  texto: string,
  id: string,
  prazoMs: number,
  aoEscrever?: (mensagem: proto.IMessage) => void,
): Promise<void> {
  let ouvinte: ((no: { attrs: Record<string, string | undefined> }) => void) | undefined;
  let timer: NodeJS.Timeout | undefined;
  const ack = new Promise<void>((ok, erro) => {
    ouvinte = ({ attrs }) => {
      if (attrs.id !== id) return;
      if (attrs.error) erro(new Error(`O WhatsApp recusou a mensagem (erro ${attrs.error}).`));
      else ok();
    };
    timer = setTimeout(() => erro(new Error(MSG_SEM_ACK)), prazoMs);
  });
  sock.ws.on(EVENTO_ACK, ouvinte!);
  try {
    const envio = sock.sendMessage(grupoId, { text: texto }, { messageId: id });
    envio.catch(() => {}); // se o ack vencer a corrida, uma falha tardia do envio não derruba o processo
    const msg = await Promise.race([envio, ack]);
    if (msg?.message) aoEscrever?.(msg.message);
    await ack;
  } finally {
    clearTimeout(timer);
    sock.ws.off(EVENTO_ACK, ouvinte!);
  }
}

/** Logger que a Baileys exige; calado, a não ser com PELADA_ROBO_DEBUG=1. */
function loggerDaBaileys() {
  const falar = process.env.PELADA_ROBO_DEBUG === '1';
  const nivel = (n: string) => (obj: unknown, msg?: string) => {
    if (falar) console.error(`[baileys ${n}]`, msg ?? '', typeof obj === 'string' ? obj : JSON.stringify(obj));
  };
  const logger = {
    level: falar ? 'debug' : 'silent',
    child: () => logger,
    trace: nivel('trace'),
    debug: nivel('debug'),
    info: nivel('info'),
    warn: nivel('warn'),
    error: nivel('error'),
  };
  return logger;
}

/** Conecta (reconectando sozinho em quedas passageiras) e resolve quando a conexão abre. */
export async function conectar(op: OpcoesConexao): Promise<WhatsApp> {
  const b = await import('baileys');
  const { state, saveCreds } = await b.useMultiFileAuthState(op.pastaAuth);
  const { version } = await b.fetchLatestWaWebVersion();

  let sock: WASocket | null = null;
  let aberto = false;
  let fechando = false;
  let fatal: ErroFatalWhatsApp | null = null;
  let tentativas = 0;
  let quandoAbrir: Array<{ ok: () => void; erro: (e: Error) => void }> = [];
  // A Baileys pede de volta mensagens enviadas quando um aparelho do grupo não conseguiu ler.
  const enviadas = new Map<string, proto.IMessage>();

  const falhar = (erro: ErroFatalWhatsApp) => {
    if (fatal) return;
    fatal = erro;
    aberto = false;
    for (const w of quandoAbrir) w.erro(erro);
    quandoAbrir = [];
    void sock?.end(undefined);
    op.aoFalhar?.(erro);
  };

  const criar = () => {
    if (fechando || fatal) return;
    const s = b.makeWASocket({
      auth: state,
      version,
      logger: loggerDaBaileys(),
      browser: b.Browsers.macOS('Pelada Robô'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      getMessage: async (key: WAMessageKey) => (key.id ? enviadas.get(key.id) : undefined),
    });
    sock = s;
    s.ev.on('creds.update', saveCreds);
    s.ev.on('connection.update', (u) => {
      if (u.qr) {
        if (!op.mostrarQr) return falhar(new ErroFatalWhatsApp(MSG_DESLOGADO));
        qrcode.generate(u.qr, { small: true });
        op.log('Abra o WhatsApp do número do robô > Aparelhos conectados > Conectar um aparelho, e leia o QR acima.');
      }
      if (u.connection === 'open') {
        aberto = true;
        tentativas = 0;
        op.log('WhatsApp conectado.');
        for (const w of quandoAbrir) w.ok();
        quandoAbrir = [];
      }
      if (u.connection === 'close') {
        aberto = false;
        if (fechando || fatal || sock !== s) return;
        const erro = u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined;
        const codigo = erro?.output?.statusCode;
        if (codigo === DESLOGADO) return falhar(new ErroFatalWhatsApp(MSG_DESLOGADO));
        if (codigo === SUBSTITUIDA) return falhar(new ErroFatalWhatsApp(MSG_SUBSTITUIDA));
        tentativas++;
        const espera = codigo === REINICIAR ? 0 : Math.min(60_000, 2_000 * 2 ** Math.min(tentativas, 5));
        op.log(`WhatsApp caiu (código ${codigo ?? '?'}); reconectando em ${Math.round(espera / 1000)} s.`);
        setTimeout(criar, espera);
      }
    });
  };

  const esperarAberto = (ms: number) => {
    if (fatal) return Promise.reject(fatal);
    if (aberto) return Promise.resolve();
    return comPrazo(new Promise<void>((ok, erro) => quandoAbrir.push({ ok, erro })), ms, 'Conexão com o WhatsApp');
  };

  criar();
  // No configurar não há prazo (o usuário pode demorar para ler o QR); no laço, pedir QR já é `fatal`.
  const primeira = new Promise<void>((ok, erro) => quandoAbrir.push({ ok, erro }));
  try {
    await (op.prazoMs ? comPrazo(primeira, op.prazoMs, 'Conexão com o WhatsApp') : primeira);
  } catch (err) {
    fechando = true;
    quandoAbrir = [];
    await (sock as WASocket | null)?.end(undefined).catch(() => {});
    throw err;
  }

  return {
    async gruposChamados(nome) {
      await esperarAberto(ESPERA_ENVIO_MS);
      const todos = await sock!.groupFetchAllParticipating();
      return Object.values(todos)
        .filter((g) => g.subject === nome)
        .map((g) => ({ id: g.id, nome: g.subject, participantes: g.participants.length }));
    },
    async enviar(grupoId, texto) {
      await esperarAberto(ESPERA_ENVIO_MS);
      const id = b.generateMessageIDV2(sock!.user?.id);
      await enviarComConfirmacao(sock!, grupoId, texto, id, ESPERA_ENVIO_MS, (m) => enviadas.set(id, m));
    },
    async fechar() {
      fechando = true;
      aberto = false;
      await sock?.end(undefined);
    },
  };
}
