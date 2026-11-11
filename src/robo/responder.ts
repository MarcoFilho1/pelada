// Resposta a uma marcação no grupo: decide o texto, envia e cuida do freio e da proposta de sorteio.
// Sem WhatsApp, banco ou IA aqui dentro: tudo chega pelo contexto (os testes usam falsos).
import type { EstadoDaSemana } from '@/server/presencas';
import { decidir, emSilencio, type Envio, type EstadoDoRobo, type TipoMensagem } from './agenda';
import {
  interpretar,
  respostaFalta,
  respostaFila,
  respostaListaSemMudanca,
  TEXTO_AJUDA,
  TEXTO_AJUDA_PERGUNTA,
  type AcaoNaLista,
  type Consulta,
} from './comandos';
import { fotografar, haMudanca, mudancas, type FotoDaLista } from './foto';
import { LIMITE_RESPOSTAS, TEXTO_LIMITE, TEXTO_MUITA_GENTE, type Freio } from './freio';
import { dentroDaJanela } from './janela';
import { montarMensagem } from './mensagem';
import { ehAdmin, TEXTO_SO_ADMIN, VALIDADE_MS, type Proposta } from './sorteio-zap';

export type MensagemRecebida = {
  grupoId: string;
  /** Telefone com DDI (só dígitos); `null` quando o WhatsApp só mostrou o LID de quem mandou. */
  remetenteTelefone: string | null;
  /** Nome do WhatsApp de quem mandou (`pushName`); `null` se não veio. Vai no "pedido por" e no log. */
  remetenteNome: string | null;
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
  /** adicionar/confirmar/remover pelo nome, com as regras do jogador no site. */
  mexerNaLista: (acao: AcaoNaLista, nome: string, now: Date) => Promise<{ texto: string; mudou: boolean }>;
  consultar: (tipo: Consulta, now: Date) => Promise<string>;
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

/** Comando que não é nenhum dos prontos: sem IA, a lista de comandos. */
async function respostaPergunta(texto: string, m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  if (!c.ia) return TEXTO_AJUDA;
  if (!c.freio.podePerguntar()) return TEXTO_LIMITE;
  const r = await c.perguntar(texto, { agora: () => m.quando });
  c.freio.registrarPergunta();
  return r;
}

/** Quem pediu, para o "pedido por" (nunca o telefone). */
const quemPediu = (m: MensagemRecebida) => m.remetenteNome?.trim() || 'alguém';

/** Linha do log para marcação sem resposta: o motivo e o nome do WhatsApp (nunca o telefone). */
function ignorada(m: MensagemRecebida, c: ContextoDaResposta, motivo: string): null {
  c.log(`marcação ignorada (${motivo})${m.remetenteNome ? ` de ${m.remetenteNome}` : ''}`);
  return null;
}

/** Passou do limite: um aviso de "muita gente" por 60 s, que não conta nas respostas. */
async function avisarLimite(m: MensagemRecebida, c: ContextoDaResposta): Promise<null> {
  ignorada(m, c, `limite de ${LIMITE_RESPOSTAS} por minuto`);
  if (!c.freio.podeAvisar()) return null;
  try {
    await c.enviar(TEXTO_MUITA_GENTE);
    c.freio.registrarAviso();
  } catch (err) {
    c.log(`aviso de limite não saiu: ${(err as Error).message}`);
  }
  return null;
}

/**
 * Responde a uma mensagem do grupo, se for marcação do robô no grupo configurado, fora do silêncio
 * e dentro do limite de respostas. Envia, registra a resposta no freio e devolve o que saiu (ou `null`).
 * Marcação sem resposta deixa uma linha no log com o motivo.
 * O sorteio só sai pelo comando `sortear`, nunca pela IA. Erro ao enviar: registra no log, não tenta de novo.
 */
export async function responder(m: MensagemRecebida, c: ContextoDaResposta): Promise<Resposta | null> {
  const chamou = m.mencionaORobo || m.respondeAoRobo;
  if (!c.estadoGrupoId || m.grupoId !== c.estadoGrupoId) return chamou ? ignorada(m, c, 'outro grupo') : null;
  const cmd = interpretar(m.texto);
  // Sem marcação, só o "sim" respondendo à mensagem do robô com proposta guardada (citar o robô não é marcar).
  if (!m.mencionaORobo && !(m.respondeAoRobo && cmd.tipo === 'sim' && c.proposta.atual)) {
    return m.respondeAoRobo ? ignorada(m, c, 'resposta ao robô sem comando reconhecido') : null;
  }
  if (emSilencio(m.quando)) return ignorada(m, c, 'silêncio 23–08');
  // O "sim" de quem pediu o sorteio nunca é barrado pelo limite.
  const p = c.proposta.atual;
  const simDeQuemPediu = cmd.tipo === 'sim' && p !== null && m.remetenteTelefone !== null && ehAdmin(m.remetenteTelefone, [p.adminTelefone]);
  if (!simDeQuemPediu && !c.freio.podeResponder()) return avisarLimite(m, c);
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
      r = { texto: c.ia ? `${TEXTO_AJUDA}\n${TEXTO_AJUDA_PERGUNTA}` : TEXTO_AJUDA };
      break;
    case 'sortear':
      r = { texto: await respostaSortear(m, c) };
      break;
    case 'sim':
      r = { texto: await respostaSim(m, c) };
      break;
    case 'adicionar':
    case 'confirmar':
    case 'remover': {
      // Qualquer pessoa do grupo pode; a mudança na lista mostra quem pediu.
      const feito = await c.mexerNaLista(cmd.tipo, cmd.nome, m.quando);
      r = { texto: feito.mudou ? `${feito.texto} (pedido por ${quemPediu(m)})` : feito.texto };
      break;
    }
    case 'artilheiro':
    case 'garcom':
    case 'ranking':
    case 'times':
      r = { texto: await c.consultar(cmd.tipo, m.quando) };
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
