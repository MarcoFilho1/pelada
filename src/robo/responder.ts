// Resposta a uma marcação no grupo: decide o texto, envia e cuida do freio e da proposta de sorteio.
// Sem WhatsApp, banco ou IA aqui dentro: tudo chega pelo contexto (os testes usam falsos).
import type { EstadoDaSemana } from '@/server/presencas';
import { decidir, emSilencio, type Envio, type EstadoDoRobo, type TipoMensagem } from './agenda';
import { interpretar, respostaFalta, respostaFila, respostaListaSemMudanca, TEXTO_AJUDA } from './comandos';
import { fotografar, haMudanca, mudancas, type FotoDaLista } from './foto';
import { TEXTO_LIMITE, type Freio } from './freio';
import { dentroDaJanela } from './janela';
import { montarMensagem } from './mensagem';
import { ehAdmin, TEXTO_SO_ADMIN, VALIDADE_MS, type Proposta } from './sorteio-zap';

export type MensagemRecebida = {
  grupoId: string;
  /** Telefone com DDI (só dígitos); `null` quando o WhatsApp só mostrou o LID de quem mandou. */
  remetenteTelefone: string | null;
  texto: string;
  mencionaORobo: boolean;
  /** A mensagem cita (responde a) uma mensagem do robô. Só vale para o "sim" do sorteio. */
  respondeAoRobo: boolean;
  quando: Date;
};

export type ContextoDaResposta = {
  estadoGrupoId: string | null;
  freio: Freio;
  admins: string[];
  /** `null`: perguntas livres desligadas (sem chave ou sem modelo no `.env`). */
  ia: { chave: string; modelo: string } | null;
  /** `estado.ultimo`: a última lista que o robô mandou. */
  ultimo: Envio | null;
  /** A proposta de sorteio esperando o "sim" (uma só; a nova substitui a antiga). */
  proposta: { atual: Proposta | null };
  lerLista: (now: Date) => Promise<EstadoDaSemana>;
  propor: (now: Date, telefone: string) => Promise<Proposta | { erro: string }>;
  confirmar: (now: Date, telefone: string, proposta: Proposta | null) => Promise<{ ok: string } | { erro: string }>;
  perguntar: (texto: string, op: { agora: () => Date }) => Promise<string>;
  /** Resolve só com o envio confirmado pelo WhatsApp. */
  enviar: (texto: string) => Promise<void>;
  log: (linha: string) => void;
};

export type Resposta = {
  texto: string;
  /** Foi a lista completa: o chamador grava `estado.ultimo` como num envio automático, se `podeGravarLista`. */
  ehListaCompleta: boolean;
  gravar?: { tipo: TipoMensagem; foto: FotoDaLista };
};

export const TEXTO_SEM_IA = 'As perguntas livres não estão ligadas.';

/** Lê `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` e `ROBO_ADMINS` (separados por vírgula). */
export function configDasRespostas(env: Record<string, string | undefined>): { ia: ContextoDaResposta['ia']; admins: string[] } {
  const chave = env.OPENROUTER_API_KEY?.trim() ?? '';
  const modelo = env.OPENROUTER_MODEL?.trim() ?? '';
  const admins = (env.ROBO_ADMINS ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  return { ia: chave && modelo ? { chave, modelo } : null, admins };
}

/**
 * A lista respondida pode virar a "última lista" (as rodadas comparam com ela)? Só quando a volta
 * automática deste momento seria uma rodada comum ou nada: gravar levaria a rodada atual e engoliria
 * a abertura, o lembrete das 12:00, o aviso do prazo, a primeira da semana ou o aviso de cancelamento.
 */
export function podeGravarLista(now: Date, foto: FotoDaLista, estado: EstadoDoRobo): boolean {
  if (!dentroDaJanela(now)) return false;
  const tipo = decidir(now, foto, estado);
  return tipo === null || tipo === 'rodada';
}

/** "15:30" no horário de Recife (sempre UTC-3). */
function horaMinuto(iso: string): string {
  return new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(11, 16);
}

/** `lista`: frase curta se nada mudou desde a última lista do robô; senão a lista com o cabeçalho. */
async function respostaLista(m: MensagemRecebida, c: ContextoDaResposta): Promise<Omit<Resposta, 'ehListaCompleta'>> {
  const lista = await c.lerLista(m.quando);
  const foto = fotografar(lista);
  const anterior = c.ultimo && c.ultimo.foto.dataQuarta === foto.dataQuarta ? c.ultimo.foto : null;
  const cancelada = foto.estadoManual === 'cancelada';
  const eraCancelada = anterior?.estadoManual === 'cancelada';

  let tipo: TipoMensagem;
  if (!anterior) tipo = cancelada ? 'cancelada' : 'primeira';
  else if (cancelada) tipo = 'cancelada';
  else if (eraCancelada) tipo = 'voltou';
  else tipo = 'rodada';

  const semMudanca = anterior && (cancelada ? eraCancelada : !eraCancelada && !haMudanca(mudancas(anterior, foto)));
  if (semMudanca) return { texto: respostaListaSemMudanca(horaMinuto(c.ultimo!.quando)) };
  return { texto: montarMensagem(tipo, lista, foto, anterior), gravar: { tipo, foto } };
}

async function respostaSortear(m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  const tel = m.remetenteTelefone;
  if (!tel || !ehAdmin(tel, c.admins)) return TEXTO_SO_ADMIN;
  const r = await c.propor(m.quando, tel);
  if ('erro' in r) return r.erro;
  c.proposta.atual = r;
  return r.texto;
}

async function respostaSim(m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  const guardada = c.proposta.atual;
  if (!guardada) return 'Não tem sorteio esperando confirmação.';
  const r = await c.confirmar(m.quando, m.remetenteTelefone ?? '', guardada);
  // Confirmada ou vencida, a proposta acaba: um segundo "sim" não tem o que confirmar.
  if ('ok' in r || m.quando.getTime() - guardada.criadaEm.getTime() >= VALIDADE_MS) {
    if (c.proposta.atual === guardada) c.proposta.atual = null;
  }
  return 'ok' in r ? r.ok : r.erro;
}

async function respostaPergunta(texto: string, m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  if (!c.ia) return TEXTO_SEM_IA;
  if (!c.freio.podePerguntar()) return TEXTO_LIMITE;
  const r = await c.perguntar(texto, { agora: () => m.quando });
  c.freio.registrarPergunta();
  return r;
}

/**
 * Responde a uma mensagem do grupo, se for marcação do robô no grupo configurado, fora do silêncio
 * e com o freio liberado. Envia, registra a resposta no freio e devolve o que saiu (ou `null`).
 * O sorteio só sai pelo comando `sortear`, nunca pela IA. Erro ao enviar: registra no log, não tenta de novo.
 */
export async function responder(m: MensagemRecebida, c: ContextoDaResposta): Promise<Resposta | null> {
  if (!c.estadoGrupoId || m.grupoId !== c.estadoGrupoId) return null;
  const cmd = interpretar(m.texto);
  // Sem marcação, só o "sim" respondendo à mensagem do robô com proposta guardada (citar o robô não é marcar).
  if (!m.mencionaORobo && !(m.respondeAoRobo && cmd.tipo === 'sim' && c.proposta.atual)) return null;
  if (emSilencio(m.quando)) return null;
  // O "sim" de quem pediu o sorteio costuma vir no mesmo minuto da proposta: não passa pelo freio.
  const p = c.proposta.atual;
  const simDeQuemPediu = cmd.tipo === 'sim' && p !== null && m.remetenteTelefone !== null && ehAdmin(m.remetenteTelefone, [p.adminTelefone]);
  if (!simDeQuemPediu && !c.freio.podeResponder()) return null;
  if ((cmd.tipo === 'sortear' || cmd.tipo === 'sim') && m.remetenteTelefone === null) {
    c.log('marcação de remetente sem telefone (LID): não dá para saber se é organizador');
  }

  let r: Omit<Resposta, 'ehListaCompleta'>;
  switch (cmd.tipo) {
    case 'lista':
      r = await respostaLista(m, c);
      break;
    case 'falta':
      r = { texto: respostaFalta(await c.lerLista(m.quando)) };
      break;
    case 'fila':
      r = { texto: respostaFila(await c.lerLista(m.quando)) };
      break;
    case 'ajuda':
      r = { texto: TEXTO_AJUDA };
      break;
    case 'sortear':
      r = { texto: await respostaSortear(m, c) };
      break;
    case 'sim':
      r = { texto: await respostaSim(m, c) };
      break;
    case 'pergunta':
      r = { texto: await respostaPergunta(cmd.texto, m, c) };
      break;
  }

  try {
    await c.enviar(r.texto);
  } catch (err) {
    c.log(`resposta não saiu (não tenta de novo): ${(err as Error).message}`);
    return null;
  }
  c.freio.registrarResposta();
  // Se grava `estado.ultimo` quem decide é o chamador, depois do ack, com `podeGravarLista`.
  return { texto: r.texto, ehListaCompleta: r.gravar !== undefined, gravar: r.gravar };
}
