// O robô falando com o WhatsApp pelo ZapGate (em vez da Baileys): mesma interface `WhatsApp`.
//
// O ZapGate roda à parte (serviço próprio no Mac) e mantém a conexão. Ele passa cada envio pelas
// regras anti-ban (só responde a quem escreveu, grupos e organizadores liberados em
// `allow_initiate`, limites, horário de silêncio, SAIR) e entrega o que chega por webhook assinado.
// Aqui o robô só: abre um servidorzinho local para o webhook, traduz os eventos para
// `MensagemRecebida` e manda pela API.
import { createServer, type Server } from 'node:http';
import { ZapGate, ZapGateError, createWebhookHandler, type MessageReceived, type SessionStatus } from './zapgate';
import type { MensagemRecebida } from './responder';
import { ErroFatalWhatsApp, type Grupo, type WhatsApp } from './whatsapp';
import { ErroDeLimite, type TipoDeLimite } from './limite';

export type OpcoesMotor = {
  /** Ex.: http://127.0.0.1:8787 */
  url: string;
  /** Chave da API do ZapGate (escopos read + send). */
  chave: string;
  /** Sessão no zapgate.toml (padrão "pelada"). */
  sessao: string;
  /** Porta local do webhook (o zapgate.toml aponta `[sessions.webhook] url` para ela). */
  portaWebhook: number;
  /** Segredo do webhook (o mesmo do zapgate.toml). */
  segredoWebhook: string;
  /** Desiste se a sessão não estiver conectada neste tempo. Sem valor: espera o quanto for. */
  prazoMs?: number;
  log: (linha: string) => void;
  aoFalhar?: (erro: ErroFatalWhatsApp) => void;
  aoReceber?: (mensagem: MensagemRecebida) => void;
};

/** Quanto um envio espera o ZapGate reconectar depois de uma queda curta. */
const ESPERA_RECONEXAO_MS = 60_000;

/** Estados em que a sessão parou de vez no ZapGate (precisa de gente). */
const PARADOS = new Set(['wrong_number', 'logged_out', 'replaced', 'banned', 'failed']);

const MSG_PARADO: Record<string, string> = {
  wrong_number: 'O ZapGate está ligado a outro número. Pareie de novo o número do robô: `zapgate pair pelada`.',
  logged_out: 'O WhatsApp desconectou o ZapGate. Pareie de novo: `zapgate pair pelada`.',
  replaced: 'Outra conexão com este número tomou o lugar do ZapGate. Veja e rode `zapgate resume pelada`.',
  banned: 'O WhatsApp baniu o número do robô.',
  failed: 'O ZapGate parou com um erro que reconectar não resolve (veja o log dele).',
};

/** "5583...@s.whatsapp.net" → "5583..."; LID e grupo → null. */
function telefone(endereco: string | undefined | null): string | null {
  const m = /^(\d+)@s\.whatsapp\.net$/.exec(endereco ?? '');
  return m ? m[1] : null;
}

const usuario = (endereco: string) => endereco.slice(0, endereco.indexOf('@'));

/** Mensagens que chegam com mais que isso de atraso (reconexão, sincronização) são ignoradas. */
export const ATRASO_MAXIMO_S = 600;

/**
 * Evento `message.received` do ZapGate → mensagem do robô (mesma forma que vinha da Baileys).
 * `eu`: os endereços do robô (telefone e LID), para tirar a marcação dele do texto.
 *
 * Devolve `null` para o que o robô não deve tratar: sem texto, ou **atrasada** (enviada há mais de
 * 10 minutos). Um comando antigo ("anotar", "sai fulano") que chega depois de uma reconexão não
 * deve mexer na lista agora — foi um disparo assim, com mensagens antigas, que baniu o número.
 */
export function lerEventoDoZapGate(m: MessageReceived, eu: string[], agoraS = Date.now() / 1000): MensagemRecebida | null {
  if (m.text == null) return null;
  if (agoraS - m.timestamp > ATRASO_MAXIMO_S) return null;
  const doRobo = new Set(eu.map(usuario));
  const outros = new Set(m.mentions.filter((j) => !eu.includes(j)).map(usuario));
  // No texto a marcação aparece como "@<usuário>": a do robô sai; a de outra pessoa vira "@alguém".
  const textoLimpo = m.text.replace(/@(\d+)/g, (inteiro, u: string) => (doRobo.has(u) ? ' ' : outros.has(u) ? '@alguém' : inteiro));
  const privado = !m.is_group;
  return {
    grupoId: m.chat,
    respondeAoRobo: m.replies_to_me === true,
    remetenteTelefone: telefone(m.sender) ?? telefone(m.sender_alt),
    remetenteNome: m.push_name?.trim() || null,
    // As quebras de linha ficam (o "importar" lê os times linha a linha); espaços repetidos viram um.
    texto: textoLimpo
      .split('\n')
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    mencionaORobo: m.mentions_me,
    quando: new Date(m.timestamp * 1000),
    id: m.id,
    remetente: m.sender,
    ...(privado ? { privado: true } : {}),
  };
}

const LIMITES: Record<string, TipoDeLimite> = { rate_limited: 'minuto', hourly_limit: 'hora', daily_limit: 'dia' };

/** Recusa por limite de envio → `ErroDeLimite` (o `responder` espera e tenta de novo); o resto, `null`. */
export function erroDeLimite(err: unknown): ErroDeLimite | null {
  if (!(err instanceof ZapGateError) || !LIMITES[err.code]) return null;
  return new ErroDeLimite(explicarErro(err), LIMITES[err.code], (err.retryAfter ?? 60) * 1000);
}

/** Explica em português uma recusa do ZapGate (o que fazer, se algo). */
export function explicarErro(err: unknown): string {
  if (!(err instanceof ZapGateError)) return (err as Error).message;
  const motivo: Record<string, string> = {
    receive_only: 'o envio está desligado no ZapGate (ligue no painel: http://127.0.0.1:8787/panel/)',
    recipient_not_allowed: 'essa conversa não está liberada no ZapGate (privado só para a lista, outro robô, ou grupo que ele não lê)',
    loop_suspected: 'essa conversa responde mais rápido que uma pessoa, várias vezes seguidas (outro robô?); pausada por algumas horas',
    hourly_limit: 'limite de mensagens por hora (o aquecimento reduz os limites nas duas primeiras semanas)',
    daily_limit: 'limite de mensagens do dia',
    first_contact_limit: 'limite de conversas novas',
    not_a_reply: 'a conversa não escreveu antes e não está em allow_initiate',
    offline_message: 'a mensagem chegou atrasada; o ZapGate não deixa responder automaticamente',
    opted_out: 'a pessoa pediu para sair',
    quiet_hours: 'horário de silêncio',
    cautious_mode: 'modo cauteloso (sinais de risco): só respostas',
    not_connected: 'o ZapGate não está conectado agora',
    duplicate_content: 'o mesmo texto acabou de ir para esta conversa',
  };
  return `zapgate recusou (${err.code}): ${motivo[err.code] ?? err.message}`;
}

async function esperarConectado(wa: ZapGate, prazoMs: number | undefined, log: (l: string) => void): Promise<SessionStatus> {
  const fim = prazoMs ? Date.now() + prazoMs : Infinity;
  let avisou = false;
  for (;;) {
    const st = await wa.status().catch((e: unknown) => {
      if (!avisou) log(`zapgate ainda não responde (${(e as Error).message}); esperando...`);
      avisou = true;
      return null;
    });
    if (st?.state === 'connected') return st;
    if (st && PARADOS.has(st.state)) throw new ErroFatalWhatsApp(MSG_PARADO[st.state] ?? `ZapGate: sessão ${st.state}`);
    if (Date.now() > fim) throw new Error(`ZapGate: a sessão não conectou a tempo (estado: ${st?.state ?? 'sem resposta'})`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** Abre o webhook local e espera a sessão conectada no ZapGate. */
export async function conectarMotor(op: OpcoesMotor): Promise<WhatsApp> {
  const wa = new ZapGate({ baseUrl: op.url, apiKey: op.chave, session: op.sessao });
  let eu: string[] = [];
  let fatal: ErroFatalWhatsApp | null = null;
  const falhar = (e: ErroFatalWhatsApp) => {
    if (fatal) return;
    fatal = e;
    op.aoFalhar?.(e);
  };

  const servidor: Server = createServer(
    createWebhookHandler({
      secret: op.segredoWebhook,
      async onEvent(evento) {
        if (evento.session !== op.sessao) return;
        switch (evento.type) {
          case 'message.received': {
            // Sem o LID do robô (início, ou o motor ainda não sabia), a marcação dele ficaria no texto.
            if (!eu.some((e) => e.endsWith('@lid'))) {
              const st = await wa.status().catch(() => null);
              if (st) eu = [st.own_address, st.own_lid].filter((e): e is string => !!e);
            }
            const m = lerEventoDoZapGate(evento.data, eu);
            if (m) op.aoReceber?.(m);
            else if (evento.data.text != null) op.log(`mensagem ${evento.data.id} ignorada: chegou atrasada (enviada há mais de 10 min)`);
            break;
          }
          case 'session.state':
            if (PARADOS.has(evento.data.state)) falhar(new ErroFatalWhatsApp(MSG_PARADO[evento.data.state] ?? evento.data.state));
            else op.log(`ZapGate: sessão ${evento.data.state}${evento.data.reason ? ` (${evento.data.reason})` : ''}`);
            break;
          case 'session.risk':
            op.log(`ZapGate: risco ${evento.data.level} (${evento.data.signal})`);
            break;
          default:
            break;
        }
      },
      onError: (e) => op.log(`webhook do ZapGate: ${(e as Error).message}`),
    }),
  );
  await new Promise<void>((ok, erro) => {
    servidor.once('error', erro);
    servidor.listen(op.portaWebhook, '127.0.0.1', () => ok());
  });

  try {
    const st = await esperarConectado(wa, op.prazoMs, op.log);
    eu = [st.own_address, st.own_lid].filter((e): e is string => !!e);
    op.log(`ZapGate conectado (${st.own_address}); envio: ${st.sending}.`);
    if (st.sending === 'receive_only') op.log('Atenção: o envio está desligado no ZapGate. Para ligar: painel em http://127.0.0.1:8787/panel/ › Regras › Envio');
  } catch (err) {
    servidor.close();
    throw err;
  }

  return {
    async gruposChamados(nome: string): Promise<Grupo[]> {
      const grupos = await wa.groups(nome);
      return grupos
        .filter((g) => g.name === nome)
        .map((g) => ({ id: g.address, nome: g.name, participantes: g.participants ?? 0 }));
    },
    async enviar(conversa: string, texto: string): Promise<void> {
      if (fatal) throw fatal;
      // Só resolve quando o servidor do WhatsApp confirma (wait=ack é o padrão). O ZapGate lê,
      // pensa e digita antes, e quebra respostas longas em partes: pode levar mais de um minuto,
      // então espera até 3. Sem `clientRef`: repetir o mesmo texto é legítimo (duas pessoas
      // perguntando a mesma coisa); o ZapGate só recusa o mesmo texto para a mesma conversa em 2 min.
      const tentar = () => wa.sendText(conversa, texto, { timeoutS: 180 });
      try {
        await tentar();
      } catch (err) {
        // Queda curta: como a Baileys fazia, espera reconectar (até 1 min) e tenta mais uma vez.
        // Só quando nada saiu (não conectado); sem confirmação, a mensagem pode ter saído.
        const limite = erroDeLimite(err);
        if (limite) throw limite;
        if (!(err instanceof ZapGateError && err.code === 'not_connected')) throw new Error(explicarErro(err));
        try {
          await esperarConectado(wa, ESPERA_RECONEXAO_MS, op.log);
          await tentar();
        } catch (err2) {
          throw new Error(explicarErro(err2));
        }
      }
    },
    async conversaDoTelefone(tel: string): Promise<string | null> {
      const r = await wa.lookup(tel);
      return r.exists ? (r.address ?? null) : null;
    },
    // O próprio ZapGate mostra "digitando…" pelo tempo que uma pessoa levaria, antes de cada parte.
    async digitando(): Promise<void> {},
    // Um texto ou várias partes (uma mensagem cada, uma só no limite). Cancela no ZapGate se
    // `cancelar()` ficar verdadeiro antes da 1ª sair.
    async enviarCancelavel(conversa: string, texto: string | string[], cancelar?: () => boolean): Promise<'enviada' | 'cancelada'> {
      if (fatal) throw fatal;
      let ref: string;
      try {
        const opcoes = { wait: 'queued' as const };
        ref = (Array.isArray(texto) ? await wa.sendParts(conversa, texto, opcoes) : await wa.sendText(conversa, texto, opcoes)).ref;
      } catch (err) {
        throw erroDeLimite(err) ?? new Error(explicarErro(err));
      }
      // Acompanha até sair; se a pessoa escrever de novo antes, cancela no ZapGate.
      const fim = Date.now() + 180_000;
      let tentouCancelar = false;
      while (Date.now() < fim) {
        if (!tentouCancelar && cancelar?.()) {
          tentouCancelar = true;
          if (await wa.cancel(ref)) return 'cancelada';
        }
        const st = await wa.message(ref).catch(() => null);
        if (st?.status === 'acked' || st?.status === 'delivered' || st?.status === 'read') return 'enviada';
        if (st?.status === 'failed') throw new Error(`zapgate: a mensagem falhou (${(st as { error?: { code?: string } }).error?.code ?? '?'})`);
        await new Promise((ok) => setTimeout(ok, 300));
      }
      throw new Error('O servidor do WhatsApp não confirmou a mensagem a tempo.');
    },
    // A reação passa pelas mesmas regras do ZapGate (tem limite próprio por hora). Ao reagir ele
    // também marca a mensagem como lida. Espera só ser aceita na fila, não o ack.
    async reagir(conversa: string, mensagemId: string, emoji: string): Promise<void> {
      if (fatal) throw fatal;
      try {
        await wa.react(conversa, mensagemId, emoji, { wait: 'queued' });
      } catch (err) {
        throw new Error(explicarErro(err));
      }
    },
    async fechar(): Promise<void> {
      await new Promise<void>((ok) => servidor.close(() => ok()));
    },
  };
}
