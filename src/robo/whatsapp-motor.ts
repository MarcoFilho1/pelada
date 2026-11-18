// O robô falando com o WhatsApp pelo motor-wa (em vez da Baileys): mesma interface `WhatsApp`.
//
// O motor-wa roda à parte (serviço próprio no Mac) e mantém a conexão. Ele passa cada envio pelas
// regras anti-ban (só responde a quem escreveu, grupos e organizadores liberados em
// `allow_initiate`, limites, horário de silêncio, SAIR) e entrega o que chega por webhook assinado.
// Aqui o robô só: abre um servidorzinho local para o webhook, traduz os eventos para
// `MensagemRecebida` e manda pela API.
import { createServer, type Server } from 'node:http';
import { MotorWa, MotorWaError, createWebhookHandler, type MessageReceived, type SessionStatus } from './motor-wa';
import type { MensagemRecebida } from './responder';
import { ErroFatalWhatsApp, type Grupo, type WhatsApp } from './whatsapp';

export type OpcoesMotor = {
  /** Ex.: http://127.0.0.1:8787 */
  url: string;
  /** Chave da API do motor-wa (escopos read + send). */
  chave: string;
  /** Sessão no motor-wa.toml (padrão "pelada"). */
  sessao: string;
  /** Porta local do webhook (o motor-wa.toml aponta `[sessions.webhook] url` para ela). */
  portaWebhook: number;
  /** Segredo do webhook (o mesmo do motor-wa.toml). */
  segredoWebhook: string;
  /** Desiste se a sessão não estiver conectada neste tempo. Sem valor: espera o quanto for. */
  prazoMs?: number;
  log: (linha: string) => void;
  aoFalhar?: (erro: ErroFatalWhatsApp) => void;
  aoReceber?: (mensagem: MensagemRecebida) => void;
};

/** Quanto um envio espera o motor-wa reconectar depois de uma queda curta. */
const ESPERA_RECONEXAO_MS = 60_000;

/** Estados em que a sessão parou de vez no motor-wa (precisa de gente). */
const PARADOS = new Set(['wrong_number', 'logged_out', 'replaced', 'banned', 'failed']);

const MSG_PARADO: Record<string, string> = {
  wrong_number: 'O motor-wa está ligado a outro número. Pareie de novo o número do robô: `motor-wa pair pelada`.',
  logged_out: 'O WhatsApp desconectou o motor-wa. Pareie de novo: `motor-wa pair pelada`.',
  replaced: 'Outra conexão com este número tomou o lugar do motor-wa. Veja e rode `motor-wa resume pelada`.',
  banned: 'O WhatsApp baniu o número do robô.',
  failed: 'O motor-wa parou com um erro que reconectar não resolve (veja o log dele).',
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
 * Evento `message.received` do motor-wa → mensagem do robô (mesma forma que vinha da Baileys).
 * `eu`: os endereços do robô (telefone e LID), para tirar a marcação dele do texto.
 *
 * Devolve `null` para o que o robô não deve tratar: sem texto, ou **atrasada** (enviada há mais de
 * 10 minutos). Um comando antigo ("anotar", "sai fulano") que chega depois de uma reconexão não
 * deve mexer na lista agora — foi um disparo assim, com mensagens antigas, que baniu o número.
 */
export function lerEventoDoMotor(m: MessageReceived, eu: string[], agoraS = Date.now() / 1000): MensagemRecebida | null {
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
    ...(privado ? { privado: true } : {}),
  };
}

/** Explica em português uma recusa do motor-wa (o que fazer, se algo). */
export function explicarErro(err: unknown): string {
  if (!(err instanceof MotorWaError)) return (err as Error).message;
  const motivo: Record<string, string> = {
    receive_only: 'o envio está desligado no motor-wa (motor-wa sending pelada on)',
    not_a_reply: 'a conversa não escreveu antes e não está em allow_initiate',
    offline_message: 'a mensagem chegou atrasada; o motor-wa não deixa responder automaticamente',
    opted_out: 'a pessoa pediu para sair',
    quiet_hours: 'horário de silêncio',
    cautious_mode: 'modo cauteloso (sinais de risco): só respostas',
    not_connected: 'o motor-wa não está conectado agora',
    duplicate_content: 'o mesmo texto acabou de ir para esta conversa',
  };
  return `motor-wa recusou (${err.code}): ${motivo[err.code] ?? err.message}`;
}

async function esperarConectado(wa: MotorWa, prazoMs: number | undefined, log: (l: string) => void): Promise<SessionStatus> {
  const fim = prazoMs ? Date.now() + prazoMs : Infinity;
  let avisou = false;
  for (;;) {
    const st = await wa.status().catch((e: unknown) => {
      if (!avisou) log(`motor-wa ainda não responde (${(e as Error).message}); esperando...`);
      avisou = true;
      return null;
    });
    if (st?.state === 'connected') return st;
    if (st && PARADOS.has(st.state)) throw new ErroFatalWhatsApp(MSG_PARADO[st.state] ?? `motor-wa: sessão ${st.state}`);
    if (Date.now() > fim) throw new Error(`motor-wa: a sessão não conectou a tempo (estado: ${st?.state ?? 'sem resposta'})`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/** Abre o webhook local e espera a sessão conectada no motor-wa. */
export async function conectarMotor(op: OpcoesMotor): Promise<WhatsApp> {
  const wa = new MotorWa({ baseUrl: op.url, apiKey: op.chave, session: op.sessao });
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
            const m = lerEventoDoMotor(evento.data, eu);
            if (m) op.aoReceber?.(m);
            else if (evento.data.text != null) op.log(`mensagem ${evento.data.id} ignorada: chegou atrasada (enviada há mais de 10 min)`);
            break;
          }
          case 'session.state':
            if (PARADOS.has(evento.data.state)) falhar(new ErroFatalWhatsApp(MSG_PARADO[evento.data.state] ?? evento.data.state));
            else op.log(`motor-wa: sessão ${evento.data.state}${evento.data.reason ? ` (${evento.data.reason})` : ''}`);
            break;
          case 'session.risk':
            op.log(`motor-wa: risco ${evento.data.level} (${evento.data.signal})`);
            break;
          default:
            break;
        }
      },
      onError: (e) => op.log(`webhook do motor-wa: ${(e as Error).message}`),
    }),
  );
  await new Promise<void>((ok, erro) => {
    servidor.once('error', erro);
    servidor.listen(op.portaWebhook, '127.0.0.1', () => ok());
  });

  try {
    const st = await esperarConectado(wa, op.prazoMs, op.log);
    eu = [st.own_address, st.own_lid].filter((e): e is string => !!e);
    op.log(`motor-wa conectado (${st.own_address}); envio: ${st.sending}.`);
    if (st.sending === 'receive_only') op.log('Atenção: o envio está desligado no motor-wa. Para ligar: motor-wa sending pelada on');
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
      // Só resolve quando o servidor do WhatsApp confirma (wait=ack é o padrão). Sem `clientRef`:
      // repetir o mesmo texto é legítimo (duas pessoas perguntando a mesma coisa); o motor-wa só
      // recusa, com erro, o mesmo texto para a mesma conversa em 2 minutos.
      const tentar = () => wa.sendText(conversa, texto);
      try {
        await tentar();
      } catch (err) {
        // Queda curta: como a Baileys fazia, espera reconectar (até 1 min) e tenta mais uma vez.
        // Só quando nada saiu (não conectado); sem confirmação, a mensagem pode ter saído.
        if (!(err instanceof MotorWaError && err.code === 'not_connected')) throw new Error(explicarErro(err));
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
    // O motor-wa já espaça os envios (pausa sorteada entre mensagens); não há "digitando" à parte.
    async digitando(): Promise<void> {},
    async fechar(): Promise<void> {
      await new Promise<void>((ok) => servidor.close(() => ok()));
    },
  };
}
