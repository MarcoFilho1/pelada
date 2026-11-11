// Resposta a uma marcação no grupo: decide o texto, envia e cuida do freio e da proposta de sorteio.
// Sem WhatsApp, banco ou IA aqui dentro: tudo chega pelo contexto (os testes usam falsos).
import { normalizarNome } from '@/domain/nome';
import { textoWhatsApp } from '@/domain/copiarLista';
import type { EstadoDaSemana } from '@/server/presencas';
import { decidir, emSilencio, type Envio, type EstadoDoRobo, type TipoMensagem } from './agenda';
import {
  interpretar,
  respostaFalta,
  respostaFila,
  TAM_MAX_NOME_PEDIDO,
  TEXTO_AJUDA,
  TEXTO_AJUDA_PERGUNTA,
  TEXTO_NOME_COMPRIDO,
  type AcaoNaLista,
  type Comando,
  type Consulta,
} from './comandos';
import { semParametros, type Ferramenta, type Parametros } from './ferramentas';
import { fotografar, haMudanca, mudancas, type FotoDaLista } from './foto';
import { LIMITE_RESPOSTAS, TEXTO_LIMITE, TEXTO_MUITA_GENTE, type Freio } from './freio';
import { dentroDaJanela } from './janela';
import { montarMensagem } from './mensagem';
import { MODELO_PADRAO } from './ia';
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
  /** Números (do `ROBO_CALVINHO`) do Jonas, o "calvinho" do grupo; ausente ou vazio: só o nome do WhatsApp vale. */
  calvinho?: string[];
  /** Sorteio das brincadeiras; nos testes, fixo. */
  rng?: () => number;
  /** `null`: perguntas livres desligadas (sem `ANTHROPIC_API_KEY` no `.env`). */
  ia: { chave: string; modelo: string } | null;
  /** `estado.ultimo`: a última lista que o robô mandou. */
  ultimo: Envio | null;
  /** A proposta de sorteio esperando o "sim" (uma só; a nova substitui a antiga). */
  proposta: { atual: Proposta | null };
  lerLista: (now: Date) => Promise<EstadoDaSemana>;
  propor: (now: Date, telefone: string) => Promise<Proposta | { erro: string }>;
  confirmar: (now: Date, telefone: string, proposta: Proposta | null) => Promise<{ ok: string } | { erro: string }>;
  /** `acoes`: as ferramentas de ação desta mensagem (quem mandou já vem amarrado nelas). */
  perguntar: (texto: string, op: { agora: () => Date; acoes: Ferramenta[]; quem: string; ehJonas: boolean }) => Promise<string>;
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

/** Lê `ANTHROPIC_API_KEY`, `ROBO_MODELO` (opcional; padrão `claude-haiku-5-5`) e `ROBO_ADMINS` (separados por vírgula). */
export function configDasRespostas(env: Record<string, string | undefined>): { ia: ContextoDaResposta['ia']; admins: string[] } {
  const chave = env.ANTHROPIC_API_KEY?.trim() ?? '';
  const modelo = env.ROBO_MODELO?.trim() || MODELO_PADRAO;
  const admins = (env.ROBO_ADMINS ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  return { ia: chave ? { chave, modelo } : null, admins };
}

/** Lê `ROBO_CALVINHO` (opcional): o número do Jonas, o "calvinho" do grupo, como o `ROBO_ADMINS`. */
export function calvinhoDoEnv(env: Record<string, string | undefined>): string[] {
  return (env.ROBO_CALVINHO ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
}

/** Apelido carinhoso do Jonas no grupo: brincadeira, não ofensa. */
export const PREFIXOS_CALVINHO: Partial<Record<Comando['tipo'], string[]>> = {
  lista: ['😎 Pra você, calvinho, a lista brilhando igual sua cabeça:', '📋 Aqui, calvo! Lista fresquinha:', '✨ Saindo a lista pro meu calvinho favorito:'],
  falta: ['🕵️ Fiscalizando pro calvinho:', '⏳ O calvinho quer saber quem tá enrolando:'],
  fila: ['📝 O calvinho de olho na fila:', '📝 Fila pro meu calvo favorito:'],
  times: ['👕 Se prepara, calvinho, os times são esses:', '👕 Já passa o protetor, calvo! Os times de hoje:'],
  artilheiro: ['⚽ Os goleadores pro calvinho conferir:', '⚽ Olha quem tá balançando a rede, calvo:'],
  garcom: ['🎯 Os garçons da pelada, calvinho:', '🎯 Quem mais deu passe, calvo:'],
  ranking: ['🏆 O ranking pro meu calvinho favorito:', '🏆 Será que o calvo tá no pódio? Confere:'],
  ajuda: ['🤖 Fala, calvinho! Os comandos são esses:'],
  sortear: ['🍀 Sorteando com a sorte do calvinho:'],
};
export const PREFIXO_NAO_ENTENDI = '🤔 Não entendi, calvinho. Os comandos são esses:';
export const SALVO_CALVINHO = '🏆 Times definitivos salvos! Valeu, calvinho 😎';

/** Quem mandou é o Jonas? Pelo telefone, se o número está configurado e veio; senão, pelo primeiro nome do WhatsApp. */
function remetenteEhJonas(m: MensagemRecebida, c: ContextoDaResposta): boolean {
  if (m.remetenteTelefone !== null && c.calvinho?.length) return ehAdmin(m.remetenteTelefone, c.calvinho);
  return normalizarNome((m.remetenteNome ?? '').trim().split(/\s+/)[0] ?? '') === 'jonas';
}

/** Uma linha de brincadeira antes da resposta normal, só quando o Jonas pede e a resposta deu certo. */
function comBrincadeira(cmd: Comando, texto: string, c: ContextoDaResposta): string {
  const sortear = (v: string[]) => v[Math.floor((c.rng ?? Math.random)() * v.length)];
  if (cmd.tipo === 'pergunta') return c.ia ? texto : `${sortear([PREFIXO_NAO_ENTENDI])}\n${texto}`;
  const variantes = PREFIXOS_CALVINHO[cmd.tipo];
  if (!variantes) return texto;
  // Erro, "não tem nada" e aviso de cancelamento ficam sérios.
  const ok =
    cmd.tipo === 'lista' ? !texto.startsWith('🌧️')
    : cmd.tipo === 'times' ? texto.startsWith('👕 Times de hoje:')
    : cmd.tipo === 'artilheiro' || cmd.tipo === 'garcom' || cmd.tipo === 'ranking' ? /^[⚽🎯🏆] \S+ \(/u.test(texto)
    : cmd.tipo === 'sortear' ? c.proposta.atual?.texto === texto
    : true;
  return ok ? `${sortear(variantes)}\n${texto}` : texto;
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

export const STATUS_SEM_ATUALIZACAO = '🔄 Status: sem nenhuma atualização.';

/**
 * `lista`: sempre a lista completa. Sem mudança desde a última lista do robô, o cabeçalho é
 * "Status: sem nenhuma atualização." (e não vira a última lista); senão, o cabeçalho das mudanças.
 */
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
  if (semMudanca) {
    // Cancelada sem mudança: o aviso de cancelamento de novo (não há lista para mostrar).
    if (cancelada) return { texto: montarMensagem('cancelada', lista, foto, anterior) };
    return { texto: `${STATUS_SEM_ATUALIZACAO}\n\n${textoWhatsApp(lista, lista.data)}` };
  }
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

async function respostaSim(m: MensagemRecebida, c: ContextoDaResposta, jonas: boolean): Promise<string> {
  const guardada = c.proposta.atual;
  if (!guardada) return '🤔 Não tem sorteio esperando confirmação.';
  const r = await c.confirmar(m.quando, m.remetenteTelefone ?? '', guardada);
  // Confirmada ou vencida, a proposta acaba: um segundo "sim" não tem o que confirmar.
  if ('ok' in r || m.quando.getTime() - guardada.criadaEm.getTime() >= VALIDADE_MS) {
    if (c.proposta.atual === guardada) c.proposta.atual = null;
  }
  if ('ok' in r) return jonas ? SALVO_CALVINHO : r.ok;
  return r.erro;
}

/** Comando que não é nenhum dos prontos: sem IA, a lista de comandos. */
async function respostaPergunta(texto: string, m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  if (!c.ia) return TEXTO_AJUDA;
  if (!c.freio.podePerguntar()) return TEXTO_LIMITE;
  const r = await c.perguntar(texto, { agora: () => m.quando, acoes: ferramentasDeAcao(m, c), quem: quemPediu(m), ehJonas: remetenteEhJonas(m, c) });
  c.freio.registrarPergunta();
  return r;
}

/** Quem pediu, para o "pedido por" (nunca o telefone). */
const quemPediu = (m: MensagemRecebida) => m.remetenteNome?.trim() || 'alguém';

/** adicionar/confirmar/remover: qualquer pessoa do grupo pode; a mudança na lista mostra quem pediu. */
async function respostaNaLista(acao: AcaoNaLista, nome: string, m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  const feito = await c.mexerNaLista(acao, nome, m.quando);
  return feito.mudou ? `${feito.texto} (pedido por ${quemPediu(m)})` : feito.texto;
}

const comNome: Parametros = {
  type: 'object',
  properties: { nome: { type: 'string', description: 'O nome do jogador como a pessoa escreveu (pode ser só o começo).' } },
  required: ['nome'],
  additionalProperties: false,
};

/** O `nome` do input da IA (já um objeto, vindo do SDK), com o mesmo teto do comando escrito. */
function lerNome(args: unknown): string {
  const nome = args && typeof args === 'object' && !Array.isArray(args) ? (args as { nome?: unknown }).nome : undefined;
  if (typeof nome !== 'string' || !nome.trim()) throw new Error('nome inválido');
  return nome.trim();
}

/**
 * As ações que a IA pode pedir, cada uma pelo mesmo caminho do comando escrito: quem mandou e o
 * telefone (para o sorteio) vêm da mensagem do WhatsApp, nunca do que o modelo escreve.
 * Nenhuma confirma sorteio: o "sim" continua só pelo comando.
 */
export function ferramentasDeAcao(m: MensagemRecebida, c: ContextoDaResposta): Ferramenta[] {
  const naLista = (acao: AcaoNaLista, nome: string, descricao: string): Ferramenta => ({
    nome,
    descricao,
    parametros: comNome,
    altera: true,
    async executar(args) {
      const pedido = lerNome(args);
      if (pedido.length > TAM_MAX_NOME_PEDIDO) return TEXTO_NOME_COMPRIDO;
      return respostaNaLista(acao, pedido, m, c);
    },
  });
  const consulta = (tipo: Consulta, nome: string, descricao: string): Ferramenta => ({
    nome,
    descricao,
    parametros: semParametros,
    executar: () => c.consultar(tipo, m.quando),
  });
  return [
    naLista('adicionar', 'adicionar_jogador', 'Põe um jogador já cadastrado na lista da semana (ou na fila, se a lista estiver cheia). Devolve o texto para o grupo.'),
    naLista('confirmar', 'confirmar_jogador', 'Confirma ("vou") um jogador que já está na lista da semana. Devolve o texto para o grupo.'),
    naLista('remover', 'remover_jogador', 'Tira um jogador da lista ou da fila ("não vou"). Devolve o texto para o grupo.'),
    {
      nome: 'ver_lista',
      descricao: 'A lista completa da semana, pronta para o grupo (com o que mudou desde a última). Repita o texto sem mudar nada.',
      parametros: semParametros,
      executar: async () => (await respostaLista(m, c)).texto,
    },
    {
      nome: 'quem_falta_confirmar',
      descricao: 'Quem da lista ainda não confirmou.',
      parametros: semParametros,
      executar: async () => respostaFalta(await c.lerLista(m.quando)),
    },
    {
      nome: 'ver_fila',
      descricao: 'A fila de espera da semana.',
      parametros: semParametros,
      executar: async () => respostaFila(await c.lerLista(m.quando)),
    },
    consulta('times', 'ver_times', 'Os times definitivos da pelada de hoje, se já foram sorteados e salvos.'),
    consulta('artilheiro', 'artilheiros', 'Os 3 que mais fizeram gols no mês (ou no geral, se o mês não teve partida).'),
    consulta('garcom', 'garcons', 'Os 3 com mais assistências no mês (ou no geral).'),
    consulta('ranking', 'ranking', 'Os 5 primeiros em pontos no mês (ou no geral).'),
    {
      nome: 'pedir_sorteio',
      descricao: 'Sorteia os times de hoje sem salvar, só para os organizadores (o código confere quem mandou). Quem pediu confirma respondendo "sim".',
      parametros: semParametros,
      executar: () => respostaSortear(m, c),
    },
  ];
}

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
 * A IA pode pedir o sorteio pelo mesmo caminho do `sortear` (com a checagem de admin pelo telefone); a confirmação só sai pelo `sim`. Erro ao enviar: registra no log, não tenta de novo.
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
      r = { texto: await respostaSim(m, c, remetenteEhJonas(m, c)) };
      break;
    case 'adicionar':
    case 'confirmar':
    case 'remover':
      r = { texto: await respostaNaLista(cmd.tipo, cmd.nome, m, c) };
      break;
    case 'artilheiro':
    case 'garcom':
    case 'ranking':
    case 'times':
      r = { texto: await c.consultar(cmd.tipo, m.quando) };
      break;
    case 'pergunta':
      r = { texto: await respostaPergunta(cmd.texto, m, c) };
      break;
    case 'recusa':
      r = { texto: cmd.texto };
      break;
  }

  // Brincadeira com quem pede, só quando é o Jonas (o "sim" já trocou o texto lá em cima).
  if (cmd.tipo !== 'sim' && remetenteEhJonas(m, c)) r = { ...r, texto: comBrincadeira(cmd, r.texto, c) };

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
