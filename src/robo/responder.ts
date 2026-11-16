// Resposta a uma marcação no grupo: decide o texto, envia e cuida do freio e da proposta de sorteio.
// Sem WhatsApp, banco ou IA aqui dentro: tudo chega pelo contexto (os testes usam falsos).
import { normalizarNome } from '@/domain/nome';
import { qtdDeTimes, type QtdDeTimes } from '@/domain/sorteio';
import { textoWhatsApp } from '@/domain/copiarLista';
import type { EstadoDaSemana } from '@/server/presencas';
import { decidir, emSilencio, type Envio, type EstadoDoRobo, type TipoMensagem } from './agenda';
import {
  interpretar,
  respostaFalta,
  respostaFila,
  TAM_MAX_NOME_PEDIDO,
  interpretarPrivado,
  TEXTO_AJUDA,
  TEXTO_AJUDA_PERGUNTA,
  TEXTO_AJUDA_PRIVADO,
  TEXTO_AJUDA_PRIVADO_IA,
  TEXTO_NOME_COMPRIDO,
  type AcaoNaLista,
  type Comando,
  type Consulta,
} from './comandos';
import { lerCadastro, MAX_CADASTROS_POR_MENSAGEM, pedirNotas, TEXTO_MAX_CADASTROS, TEXTO_SO_ADMIN_CADASTRO, type PessoaPedida } from './cadastro-zap';
import { textoDoSite } from './organizador-zap';
import { ErroDeFerramenta, semParametros, TextoPronto, type Ferramenta, type Parametros } from './ferramentas';
import { fotografar, haMudanca, mudancas, type FotoDaLista } from './foto';
import { LIMITE_RESPOSTAS, TEXTO_LIMITE, TEXTO_MUITA_GENTE, type Freio } from './freio';
import { dentroDaJanela } from './janela';
import { montarMensagem } from './mensagem';
import { MODELO_PADRAO, TEXTO_MAX_MUDANCAS } from './ia';
import { ehAdmin, montarProposta, propostaVencida, TEXTO_SO_ADMIN, votar, type Proposta, type TimesPropostos } from './sorteio-zap';

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
  /** Conversa privada (não grupo): `grupoId` é a conversa; só os organizadores são atendidos. */
  privado?: boolean;
};

export type ContextoDaResposta = {
  estadoGrupoId: string | null;
  freio: Freio;
  admins: string[];
  /** Números (do `ROBO_CALVINHO`) do Jonas, o "calvinho" do grupo; ausente ou vazio: só o nome do WhatsApp vale. */
  calvinho?: string[];
  /** `ROBO_APELIDOS`: telefone → nome do jogador no site, para quem tem outro nome no WhatsApp ("eu vou"). */
  apelidos?: { telefone: string; nome: string }[];
  /** Sorteio das brincadeiras; nos testes, fixo. */
  rng?: () => number;
  /** `null`: perguntas livres desligadas (sem `ANTHROPIC_API_KEY` no `.env`). */
  ia: { chave: string; modelo: string } | null;
  /** `estado.ultimo`: a última lista que o robô mandou. */
  ultimo: Envio | null;
  /** Os times propostos esperando os votos (uma proposta só; a nova substitui a antiga). */
  proposta: { atual: Proposta | null };
  lerLista: (now: Date) => Promise<EstadoDaSemana>;
  /** `times`: 3 ou 4 (o padrão). */
  propor: (now: Date, times: QtdDeTimes) => Promise<TimesPropostos | { erro: string }>;
  /** Os times colados (formato do "Importar times" do site), lidos sem gravar. */
  importar: (now: Date, texto: string) => Promise<TimesPropostos | { erro: string }>;
  /** Grava a proposta confirmada como times definitivos, pelo caminho do site. */
  salvar: (now: Date, proposta: Proposta) => Promise<{ ok: true } | { erro: string }>;
  /** Manda um texto no privado de cada organizador, menos os telefones de `exceto`. */
  avisarOrganizadores: (texto: string, exceto: string[]) => Promise<void>;
  /** Manda no grupo configurado (o anúncio dos times confirmados no privado). */
  anunciarNoGrupo: (texto: string) => Promise<void>;
  /** `acoes`: as ferramentas de ação desta mensagem (quem mandou já vem amarrado nelas). */
  /** A resposta da IA: um texto ou, em mensagens, a fala e os textos prontos (o privado manda uma por uma). */
  perguntar: (texto: string, op: { agora: () => Date; acoes: Ferramenta[]; quem: string; ehJonas: boolean; jogador: string | null; privado: boolean }) => Promise<string | string[]>;
  /** adicionar/confirmar/remover pelo nome, com as regras do jogador no site. */
  mexerNaLista: (acao: AcaoNaLista, nome: string, now: Date) => Promise<{ texto: string; mudou: boolean }>;
  consultar: (tipo: Consulta, now: Date) => Promise<string>;
  /** Link temporário de anotar da pelada de hoje (quem confere se é organizador é o `responder`). */
  linkAnotar: (quem: string, now: Date) => Promise<{ url: string } | { erro: string }>;
  /** Privado: todos os jogadores ativos com a nota. */
  notas: (now: Date) => Promise<string>;
  /** Privado: muda a nota de um jogador achado pelo nome. */
  mudarNota: (nome: string, nota: number, now: Date) => Promise<{ texto: string; mudou: boolean }>;
  /** Endereço do site (sem a barra do fim), para o `site` do privado. */
  urlSite: string;
  /** Cadastra jogadores novos (quem confere se é organizador é o `responder`). */
  cadastrar: (pessoas: PessoaPedida[], now: Date) => Promise<{ texto: string; mudou: boolean }>;
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

/** Lê `ROBO_APELIDOS` (opcional): "5581999999999=Marquinho,5581888888888=Zé" (números só no `.env`, nunca no repositório). */
export function apelidosDoEnv(env: Record<string, string | undefined>): { telefone: string; nome: string }[] {
  return (env.ROBO_APELIDOS ?? '')
    .split(',')
    .map((par) => par.split('='))
    .filter((par) => par.length === 2 && par[0].trim() && par[1].trim())
    .map(([telefone, nome]) => ({ telefone: telefone.trim(), nome: nome.trim() }));
}

/** O jogador de quem mandou, pelo `ROBO_APELIDOS`; `null` sem telefone ou sem apelido. */
function jogadorDoRemetente(m: MensagemRecebida, c: ContextoDaResposta): string | null {
  if (!m.remetenteTelefone) return null;
  return c.apelidos?.find((a) => ehAdmin(m.remetenteTelefone!, [a.telefone]))?.nome ?? null;
}

const EU = new Set(['eu', 'me', 'mim']);

/** "confirmar eu": o jogador do apelido, ou o nome do WhatsApp. */
function nomeDoPedido(nome: string, m: MensagemRecebida, c: ContextoDaResposta): string {
  if (!EU.has(normalizarNome(nome))) return nome;
  return jogadorDoRemetente(m, c) ?? (m.remetenteNome?.trim() || nome);
}

/** Lê `ROBO_CALVINHO` (opcional): o número do Jonas, o "calvinho" do grupo, como o `ROBO_ADMINS`. */
export function calvinhoDoEnv(env: Record<string, string | undefined>): string[] {
  return (env.ROBO_CALVINHO ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
}

/** Apelido carinhoso do Jonas no grupo: brincadeira, não ofensa (nunca "careca"). */
export const PREFIXOS_CALVINHO: Partial<Record<Comando['tipo'], string[]>> = {
  lista: [
    '😎 Pra você, calvinho, a lista brilhando igual sua cabeça:',
    '📋 Aqui, calvo! Lista fresquinha:',
    '✨ Saindo a lista pro meu calvinho favorito:',
    '🔦 Nem precisei de lanterna, a cabeça do calvinho iluminou a lista:',
  ],
  falta: ['🕵️ Fiscalizando pro calvinho:', '⏳ O calvinho quer saber quem tá enrolando:', '👀 O calvinho tá de olho, hein? Ainda faltam:'],
  fila: ['📝 O calvinho de olho na fila:', '📝 Fila pro meu calvo favorito:', '🧐 O calvinho conferindo quem tá esperando:'],
  times: ['👕 Se prepara, calvinho, os times são esses:', '👕 Já passa o protetor, calvo! Os times de hoje:', '👕 Calvinho, confere se caiu no time bom:'],
  artilheiro: ['⚽ Os goleadores pro calvinho conferir:', '⚽ Olha quem tá balançando a rede, calvo:', '⚽ Calvinho, cabeçada não conta se escorregar, viu? Os artilheiros:'],
  garcom: ['🎯 Os garçons da pelada, calvinho:', '🎯 Quem mais deu passe, calvo:', '🎯 Calvinho, aprende com eles a tocar a bola:'],
  ranking: ['🏆 O ranking pro meu calvinho favorito:', '🏆 Será que o calvo tá no pódio? Confere:', '🏆 Calvinho, segura a emoção. O ranking:'],
  ajuda: ['🤖 Fala, calvinho! Os comandos são esses:', '🤖 Às ordens, calvo! É só pedir:'],
  sortear: ['🍀 Sorteando com a sorte do calvinho:', '🎩 O calvinho pediu, eu sorteio:', '🍀 Esfreguei a cabeça do calvinho pra dar sorte:'],
  adicionar: ['🫡 Pode deixar, calvinho!', '😎 Feito, chefe calvinho!', '🫡 Às ordens, calvo!'],
  confirmar: ['🫡 Pode deixar, calvinho!', '😎 O calvinho mandou, eu confirmei!', '🫡 Anotado, calvo!'],
  remover: ['🫡 Feito, calvinho.', '😢 O calvinho mandou tirar, eu tirei.'],
  anotar: ['📝 O calvinho liberou a caneta!', '📝 Anota direitinho os gols do calvinho, hein:'],
  cadastrar: ['🆕 O calvinho trazendo reforço!', '🆕 Contratações do calvinho chegando:', '🆕 O olheiro calvinho achou mais gente:'],
};
export const PREFIXO_NAO_ENTENDI = '🤔 Não entendi, calvinho. Os comandos são esses:';
export const SALVOS_CALVINHO = ['🏆 Times definitivos salvos! Valeu, calvinho 😎', '🏆 Salvo! Times escolhidos a dedo pelo calvinho ✨', '🏆 Times definitivos salvos! Agora é só brilhar, calvo 💡'];

/** Mudança feita pelo Jonas em outra pessoa: só quando mudou e o texto já não brinca com ele (ação nele mesmo). */
const mudouSemBrincadeira = (texto: string) => /^[✅📝👋]/u.test(texto) && !/calv/iu.test(texto.split('\n\n')[0]);

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
    : cmd.tipo === 'adicionar' || cmd.tipo === 'confirmar' || cmd.tipo === 'remover' ? mudouSemBrincadeira(texto)
    : cmd.tipo === 'cadastrar' ? texto.startsWith('✅ Cadastr')
    : cmd.tipo === 'anotar' ? texto.startsWith(INICIO_LINK_ANOTAR)
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

export const TEXTO_SO_ADMIN_IMPORTAR = '🔐 Só os organizadores podem importar times.';
export const TEXTO_IMPORTAR_NO_PRIVADO = '📥 Importar times é pelo privado do robô (só organizadores).';
export const TEXTO_SO_ADMIN_CONFIRMA = '🔐 Só os organizadores confirmam os times.';
export const TEXTO_SEM_PROPOSTA = '🤔 Não tem times esperando confirmação.';
export const TEXTO_PROPOSTA_VENCIDA = '⌛ Essa proposta venceu. Peça *sortear* (ou *importar*) de novo.';
export const TEXTO_TIMES_INDEFINIDOS = '👕 Os times de hoje ainda não foram definidos.';
export const TEXTO_SALVOS = '🏆 Times confirmados e salvos no site. Já mandei no grupo.';

/** Tem proposta esperando votos (e ainda valendo)? Enquanto tiver, o grupo não vê time nenhum. */
export const temPropostaPendente = (c: ContextoDaResposta, now: Date) => c.proposta.atual !== null && !propostaVencida(c.proposta.atual, now);

/** Aviso no privado dos outros organizadores: falha de envio não derruba a resposta (fica no log). */
async function avisarOutros(c: ContextoDaResposta, texto: string, exceto: string[]): Promise<void> {
  try {
    await c.avisarOrganizadores(texto, exceto);
  } catch (err) {
    c.log(`aviso aos organizadores não saiu: ${(err as Error).message}`);
  }
}

/** Nova proposta: substitui a anterior (os votos zeram) e vai para o privado dos outros organizadores. */
async function proporTimes(origem: Proposta['origem'], r: TimesPropostos | { erro: string }, tel: string, m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  if ('erro' in r) return r.erro;
  const p = montarProposta(origem, { telefone: tel, nome: quemPediu(m) }, m.quando, r);
  c.proposta.atual = p;
  await avisarOutros(c, p.texto, [tel]);
  return p.texto;
}

async function respostaSortear(m: MensagemRecebida, c: ContextoDaResposta, times: QtdDeTimes): Promise<string> {
  const tel = m.remetenteTelefone;
  if (!tel || !ehAdmin(tel, c.admins)) return TEXTO_SO_ADMIN;
  return proporTimes('sorteio', await c.propor(m.quando, times), tel, m, c);
}

/** importar + times colados: só organizadores e só no privado (no grupo, os times vazariam antes dos votos). */
async function respostaImportar(texto: string, m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  const tel = m.remetenteTelefone;
  if (!tel || !ehAdmin(tel, c.admins)) return TEXTO_SO_ADMIN_IMPORTAR;
  if (!m.privado) return TEXTO_IMPORTAR_NO_PRIVADO;
  return proporTimes('importado', await c.importar(m.quando, texto), tel, m, c);
}

/**
 * "sim" de organizador: um voto na proposta. No 2º voto, salva no site, avisa os outros organizadores no
 * privado e anuncia os times (com as notas) no grupo. Vencida ou recusada pelo site, a proposta acaba.
 */
async function respostaSim(m: MensagemRecebida, c: ContextoDaResposta, jonas: boolean): Promise<string> {
  const p = c.proposta.atual;
  if (!p) return TEXTO_SEM_PROPOSTA;
  const tel = m.remetenteTelefone;
  if (!tel || !ehAdmin(tel, c.admins)) return TEXTO_SO_ADMIN_CONFIRMA;
  const { proposta, resultado } = votar(p, tel, m.quando);
  const nome = quemPediu(m);
  switch (resultado.tipo) {
    case 'vencida':
      c.proposta.atual = null;
      return TEXTO_PROPOSTA_VENCIDA;
    case 'ja_votou':
      return `👍 Você já confirmou. Falta ${resultado.faltam} organizador confirmar.`;
    case 'contou':
      c.proposta.atual = proposta;
      await avisarOutros(c, `✅ ${nome} confirmou os times. Falta ${resultado.faltam}: responda *sim* para confirmar.`, [tel]);
      return `✅ Confirmado! Falta ${resultado.faltam} organizador confirmar.`;
    case 'fechou': {
      // A proposta acaba antes de salvar: um "sim" atrasado não salva duas vezes.
      c.proposta.atual = null;
      const salvo = await c.salvar(m.quando, proposta);
      if ('erro' in salvo) {
        const texto = `${salvo.erro}\nOs times não foram salvos.`;
        await avisarOutros(c, texto, [tel]);
        return texto;
      }
      const anuncio = `🏆 Times da noite:\n\n${proposta.blocos}`;
      if (!m.privado) {
        await avisarOutros(c, `🏆 ${nome} confirmou e os times foram salvos no site e mandados no grupo.`, [tel]);
        return anuncio;
      }
      try {
        await c.anunciarNoGrupo(anuncio);
      } catch (err) {
        c.log(`anúncio dos times no grupo não saiu: ${(err as Error).message}`);
      }
      await avisarOutros(c, `🏆 ${nome} confirmou. ${TEXTO_SALVOS}`, [tel]);
      return jonas ? SALVOS_CALVINHO[Math.floor((c.rng ?? Math.random)() * SALVOS_CALVINHO.length)] : TEXTO_SALVOS;
    }
  }
}

/** "times": com proposta pendente, o grupo não vê nada; no privado, o organizador vê a proposta e os votos. */
async function respostaTimes(m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  const p = c.proposta.atual;
  if (p && temPropostaPendente(c, m.quando)) {
    if (!m.privado) return TEXTO_TIMES_INDEFINIDOS;
    return `⏳ Times esperando confirmação (${p.votos.length} de 2):\n\n${p.texto}`;
  }
  return c.consultar('times', m.quando);
}

/** Comando que não é nenhum dos prontos: sem IA, a lista de comandos. */
async function respostaPergunta(texto: string, m: MensagemRecebida, c: ContextoDaResposta): Promise<string[]> {
  if (!c.ia) return [m.privado ? TEXTO_AJUDA_PRIVADO : TEXTO_AJUDA];
  if (!c.freio.podePerguntar()) return [TEXTO_LIMITE];
  const marca = { entrouOuConfirmou: false };
  const acoes = m.privado ? [...ferramentasDeAcao(m, c, marca), ...ferramentasDoOrganizador(m, c)] : ferramentasDeAcao(m, c, marca);
  const r = await c.perguntar(texto, { agora: () => m.quando, acoes, quem: quemPediu(m), ehJonas: remetenteEhJonas(m, c), jogador: jogadorDoRemetente(m, c), privado: m.privado === true });
  c.freio.registrarPergunta();
  const partes = Array.isArray(r) ? r : [r];
  if (!marca.entrouOuConfirmou) return partes;
  // Entrou ou confirmou alguém: a lista atual vai junto, se a resposta ainda não a trouxe.
  const lista = await listaAtual(m, c);
  return partes.some((p) => p.includes(lista)) ? partes : [...partes, lista];
}

/** Quem pediu, para o "pedido por" (nunca o telefone). */
const quemPediu = (m: MensagemRecebida) => m.remetenteNome?.trim() || 'alguém';

/** Quem entra ou confirma quer conferir a lista: depois dessas mudanças, a lista atual vai junto. */
const MOSTRA_LISTA: readonly AcaoNaLista[] = ['adicionar', 'confirmar'];

/** A lista atual, como o "Copiar lista" do site, para ir depois de uma entrada ou confirmação. */
async function listaAtual(m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  const lista = await c.lerLista(m.quando);
  return textoWhatsApp(lista, lista.data);
}

/** adicionar/confirmar/remover: qualquer pessoa do grupo pode; a mudança na lista mostra quem pediu. */
async function mudarNaLista(acao: AcaoNaLista, nome: string, m: MensagemRecebida, c: ContextoDaResposta): Promise<{ texto: string; mudou: boolean }> {
  const feito = await c.mexerNaLista(acao, nomeDoPedido(nome, m, c), m.quando);
  return feito.mudou ? { texto: `${feito.texto} (pedido por ${quemPediu(m)})`, mudou: true } : feito;
}

/** Um ou vários nomes (cada um pelo caminho de um só, com teto de tamanho), numa única mensagem; depois de entrar ou confirmar, a lista. */
async function respostaNaLista(acao: AcaoNaLista, nomes: string[], excedeu: boolean, m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  const linhas: string[] = [];
  let mudou = false;
  for (const nome of nomes) {
    if (nome.length > TAM_MAX_NOME_PEDIDO) {
      linhas.push(TEXTO_NOME_COMPRIDO);
      continue;
    }
    const feito = await mudarNaLista(acao, nome, m, c);
    linhas.push(feito.texto);
    mudou ||= feito.mudou;
  }
  if (excedeu) linhas.push(TEXTO_MAX_MUDANCAS);
  const texto = linhas.join('\n');
  return mudou && MOSTRA_LISTA.includes(acao) ? `${texto}\n\n${await listaAtual(m, c)}` : texto;
}

/** cadastrar: só organizadores, pelo telefone (como o sorteio); o cadastro mostra quem pediu. */
async function respostaCadastrar(pessoas: PessoaPedida[], excedeu: boolean, m: MensagemRecebida, c: ContextoDaResposta): Promise<{ texto: string; mudou: boolean }> {
  if (!m.remetenteTelefone || !ehAdmin(m.remetenteTelefone, c.admins)) return { texto: TEXTO_SO_ADMIN_CADASTRO, mudou: false };
  // Sem nota ninguém é cadastrado: o robô pede a nota de quem veio sem ela.
  const comNota = pessoas.filter((p) => p.nota !== null);
  const semNota = pessoas.filter((p) => p.nota === null).map((p) => p.nome);
  const feito = comNota.length ? await c.cadastrar(comNota, m.quando) : { texto: '', mudou: false };
  const linhas = feito.texto ? feito.texto.split('\n') : [];
  if (feito.mudou) linhas[0] = `${linhas[0]} (pedido por ${quemPediu(m)})`;
  if (semNota.length) linhas.push(pedirNotas(semNota));
  if (excedeu) linhas.push(TEXTO_MAX_CADASTROS);
  return { texto: linhas.join('\n'), mudou: feito.mudou };
}

const comPessoas: Parametros = {
  type: 'object',
  properties: {
    pessoas: {
      type: 'string',
      description: 'Cada pessoa como "Nome - nota", separadas por vírgula, ex.: "Caio - 2.5, Pedro - 3". Nota de 0 a 5, de 0,5 em 0,5.',
    },
  },
  required: ['pessoas'],
  additionalProperties: false,
};

const comNome: Parametros = {
  type: 'object',
  properties: { nome: { type: 'string', description: 'O nome do jogador como a pessoa escreveu (pode ser só o começo).' } },
  required: ['nome'],
  additionalProperties: false,
};

/** Opcional, como o `periodo` do ranking: omitido, 4 times. Qualquer outro valor também vira 4. */
const comTimes: Parametros = {
  type: 'object',
  properties: { times: { type: 'integer', enum: [3, 4], description: 'Quantos times: 3 ou 4. Omitido: 4. Use 3 só quando pedirem 3 times.' } },
  additionalProperties: false,
};

/** O `nome` do input da IA (já um objeto, vindo do SDK), com o mesmo teto do comando escrito. */
function lerNome(args: unknown): string {
  const nome = args && typeof args === 'object' && !Array.isArray(args) ? (args as { nome?: unknown }).nome : undefined;
  if (typeof nome !== 'string' || !nome.trim()) throw new ErroDeFerramenta('Nome inválido.');
  return nome.trim();
}

/**
 * As ações que a IA pode pedir, cada uma pelo mesmo caminho do comando escrito: quem mandou e o
 * telefone (para o sorteio) vêm da mensagem do WhatsApp, nunca do que o modelo escreve.
 * Nenhuma confirma sorteio: o "sim" continua só pelo comando.
 */
export function ferramentasDeAcao(m: MensagemRecebida, c: ContextoDaResposta, marca: { entrouOuConfirmou: boolean } = { entrouOuConfirmou: false }): Ferramenta[] {
  const naLista = (acao: AcaoNaLista, nome: string, descricao: string): Ferramenta => ({
    nome,
    descricao,
    parametros: comNome,
    altera: true,
    async executar(args) {
      const pedido = lerNome(args);
      if (pedido.length > TAM_MAX_NOME_PEDIDO) throw new ErroDeFerramenta(TEXTO_NOME_COMPRIDO);
      const feito = await mudarNaLista(acao, pedido, m, c);
      // Não mudou (não achou, já estava, recusa do site): o modelo recebe o texto como erro e explica.
      if (!feito.mudou) throw new ErroDeFerramenta(feito.texto);
      if (MOSTRA_LISTA.includes(acao)) marca.entrouOuConfirmou = true;
      return new TextoPronto(feito.texto, 'acao');
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
      executar: async () => new TextoPronto((await respostaLista(m, c)).texto, 'lista'),
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
    {
      nome: 'ver_times',
      descricao: 'Os times definitivos da pelada de hoje, se já foram confirmados e salvos. Repita o texto sem mudar nada.',
      parametros: semParametros,
      executar: () => respostaTimes(m, c),
    },
    consulta('artilheiro', 'artilheiros', 'Os 3 que mais fizeram gols no mês (ou no geral, se o mês não teve partida).'),
    consulta('garcom', 'garcons', 'Os 3 com mais assistências no mês (ou no geral).'),
    consulta('ranking', 'ranking', 'Os 5 primeiros em pontos no mês (ou no geral).'),
    {
      nome: 'cadastrar_jogadores',
      descricao: `Cadastra jogadores NOVOS no site, com nota, só para os organizadores (o código confere quem mandou). Até ${MAX_CADASTROS_POR_MENSAGEM} por vez. Toda pessoa precisa de nota: se a mensagem não trouxer, pergunte em vez de chamar. Não põe ninguém na lista. Devolve o texto para o grupo.`,
      parametros: comPessoas,
      altera: true,
      async executar(args) {
        const texto = args && typeof args === 'object' && !Array.isArray(args) ? (args as { pessoas?: unknown }).pessoas : undefined;
        if (typeof texto !== 'string' || !texto.trim()) throw new ErroDeFerramenta('Pessoas inválidas.');
        const pessoas = lerCadastro(texto);
        if (!pessoas.length) throw new ErroDeFerramenta('Nenhum nome encontrado.');
        const feito = await respostaCadastrar(pessoas.slice(0, MAX_CADASTROS_POR_MENSAGEM), pessoas.length > MAX_CADASTROS_POR_MENSAGEM, m, c);
        // Ninguém cadastrado (não é organizador, já existiam, nota inválida): o modelo explica.
        if (!feito.mudou) throw new ErroDeFerramenta(feito.texto);
        return new TextoPronto(feito.texto, 'acao');
      },
    },
    {
      nome: 'link_de_anotar',
      descricao: 'Gera o link temporário para anotar as partidas de hoje (sem senha), só para os organizadores (o código confere quem mandou). Devolve o texto para a conversa.',
      parametros: semParametros,
      async executar() {
        const r = await respostaAnotar(m, c);
        if (!r.ok) throw new ErroDeFerramenta(r.texto);
        return new TextoPronto(r.texto, 'acao');
      },
    },
    {
      nome: 'pedir_sorteio',
      descricao: 'Sorteia os times de hoje sem salvar, só para os organizadores (o código confere quem mandou). Quem pediu confirma respondendo "sim".',
      parametros: comTimes,
      sorteio: true,
      async executar(args) {
        const antes = c.proposta.atual;
        const texto = await respostaSortear(m, c, qtdDeTimes((args as { times?: unknown } | null)?.times));
        const nova = c.proposta.atual;
        // Recusa (não é admin) ou erro do sorteio: nada guardado, o modelo explica.
        if (!nova || nova === antes || nova.texto !== texto) throw new ErroDeFerramenta(texto);
        return new TextoPronto(texto, 'sorteio', () => {
          if (c.proposta.atual === nova) c.proposta.atual = null;
        });
      },
    },
  ];
}

const comNomeENota: Parametros = {
  type: 'object',
  properties: {
    nome: { type: 'string', description: 'O nome do jogador como a pessoa escreveu (pode ser só o começo).' },
    nota: { type: 'string', description: 'A nota nova, de 0 a 5, de 0,5 em 0,5 (ex.: "3.5").' },
  },
  required: ['nome', 'nota'],
  additionalProperties: false,
};

/** Só no privado de organizador: ver e mudar notas e o link do site. */
export function ferramentasDoOrganizador(m: MensagemRecebida, c: ContextoDaResposta): Ferramenta[] {
  return [
    { nome: 'ver_notas', descricao: 'Todos os jogadores ativos com a nota (0 a 5). Só no privado dos organizadores.', parametros: semParametros, executar: () => c.notas(m.quando) },
    {
      nome: 'mudar_nota',
      descricao: 'Muda a nota de um jogador cadastrado. Só no privado dos organizadores. Devolve o texto para a conversa.',
      parametros: comNomeENota,
      altera: true,
      async executar(args) {
        const nome = lerNome(args);
        const bruta = (args as { nota?: unknown }).nota;
        const nota = typeof bruta === 'string' ? Number(bruta.replace(',', '.')) : NaN;
        if (nome.length > TAM_MAX_NOME_PEDIDO) throw new ErroDeFerramenta(TEXTO_NOME_COMPRIDO);
        const feito = await c.mudarNota(nome, nota, m.quando);
        if (!feito.mudou) throw new ErroDeFerramenta(feito.texto);
        return new TextoPronto(feito.texto, 'acao');
      },
    },
    { nome: 'link_do_site', descricao: 'O endereço do site da pelada e da área dos organizadores.', parametros: semParametros, executar: async () => textoDoSite(c.urlSite) },
    {
      nome: 'confirmar_times',
      descricao: 'O voto deste organizador nos times propostos (como responder "sim"). Use só quando ele disser que confirma ou aprova os times. Devolve o texto para a conversa.',
      parametros: semParametros,
      async executar() {
        return new TextoPronto(await respostaSim(m, c, remetenteEhJonas(m, c)), 'acao');
      },
    },
    {
      nome: 'importar_times',
      sorteio: true,
      descricao: 'Importa os times feitos fora que o organizador colou nesta mensagem (o robô lê a mensagem inteira, linha a linha). Vira uma proposta que vale com 2 dos 3 organizadores. Devolve o texto para a conversa.',
      parametros: semParametros,
      async executar() {
        // A mensagem inteira, sem a primeira linha se ela só pede para importar (o resto são os times).
        const linhas = m.texto.split('\n');
        const corpo = linhas.length > 1 && /importa|times?\b|esses|estes/iu.test(linhas[0]) && !/\d/.test(linhas[0]) ? linhas.slice(1).join('\n') : m.texto;
        const antes = c.proposta.atual;
        const texto = await respostaImportar(corpo, m, c);
        if (c.proposta.atual === antes) throw new ErroDeFerramenta(texto);
        return new TextoPronto(texto, 'sorteio');
      },
    },
  ];
}

export const TEXTO_SO_ADMIN_ANOTAR = '🔐 Só os organizadores podem gerar o link de anotar.';
const INICIO_LINK_ANOTAR = '📝 Link para anotar as partidas de hoje:';

/** anotar: só organizadores (pelo telefone), no grupo ou no privado; no grupo, todo mundo fica com o link. */
async function respostaAnotar(m: MensagemRecebida, c: ContextoDaResposta): Promise<{ texto: string; ok: boolean }> {
  if (!m.remetenteTelefone || !ehAdmin(m.remetenteTelefone, c.admins)) return { texto: TEXTO_SO_ADMIN_ANOTAR, ok: false };
  const r = await c.linkAnotar(quemPediu(m), m.quando);
  if ('erro' in r) return { texto: r.erro, ok: false };
  return {
    texto: `${INICIO_LINK_ANOTAR}\n${r.url}\nAbre direto na tela de partidas, sem senha. Vale até as 3h da manhã; um link novo cancela este. (pedido por ${quemPediu(m)})`,
    ok: true,
  };
}

/** Sorteio e confirmação pelo privado chegam com a regra de 2 de 3 organizadores. */
/** O "sim" de organizador com proposta esperando nunca é barrado pelo limite de respostas. */
const simDeOrganizador = (cmd: Comando, m: MensagemRecebida, c: ContextoDaResposta) =>
  cmd.tipo === 'sim' && c.proposta.atual !== null && m.remetenteTelefone !== null && ehAdmin(m.remetenteTelefone, c.admins);

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
  if (m.privado) return responderNoPrivado(m, c);
  const chamou = m.mencionaORobo || m.respondeAoRobo;
  if (!c.estadoGrupoId || m.grupoId !== c.estadoGrupoId) return chamou ? ignorada(m, c, 'outro grupo') : null;
  const cmd = interpretar(m.texto);
  // Sem marcação, só o "sim" respondendo à mensagem do robô com proposta guardada (citar o robô não é marcar).
  if (!m.mencionaORobo && !(m.respondeAoRobo && cmd.tipo === 'sim' && c.proposta.atual)) {
    return m.respondeAoRobo ? ignorada(m, c, 'resposta ao robô sem comando reconhecido') : null;
  }
  if (emSilencio(m.quando)) return ignorada(m, c, 'silêncio 23–08');
  if (!simDeOrganizador(cmd, m, c) && !c.freio.podeResponder()) return avisarLimite(m, c);
  if ((cmd.tipo === 'sortear' || cmd.tipo === 'sim' || cmd.tipo === 'importar' || cmd.tipo === 'cadastrar' || cmd.tipo === 'anotar') && m.remetenteTelefone === null) {
    c.log('marcação de remetente sem telefone (LID): não dá para saber se é organizador');
  }

  return responderComando(cmd, m, c);
}

/**
 * Privado: só os organizadores (pelo telefone; sem telefone, ignora), sem marcação e a qualquer hora
 * (o silêncio das 23–08 é do grupo). Valem os comandos do grupo e os de organizador. A lista respondida
 * aqui nunca vira a "última lista" do grupo.
 */
async function responderNoPrivado(m: MensagemRecebida, c: ContextoDaResposta): Promise<Resposta | null> {
  if (m.remetenteTelefone === null) return ignorada(m, c, 'privado sem telefone (LID)');
  if (!ehAdmin(m.remetenteTelefone, c.admins)) {
    c.log('privado de quem não é organizador ignorado');
    return null;
  }
  const cmd = interpretarPrivado(m.texto);
  if (!simDeOrganizador(cmd, m, c) && !c.freio.podeResponder()) return avisarLimite(m, c);
  const r = await responderComando(cmd, m, c);
  return r && { ...r, ehListaCompleta: false, gravar: undefined };
}

/** O comando já liberado: monta o texto, envia, registra no freio. */
async function responderComando(cmd: Comando, m: MensagemRecebida, c: ContextoDaResposta): Promise<Resposta | null> {
  let r: Omit<Resposta, 'ehListaCompleta'>;
  let emPartes: string[] | null = null;
  switch (cmd.tipo) {
    case 'lista':
      r = await respostaLista(m, c);
      if (m.privado) r = { texto: r.texto };
      break;
    case 'notas':
      r = { texto: await c.notas(m.quando) };
      break;
    case 'anotar':
      r = { texto: (await respostaAnotar(m, c)).texto };
      break;
    case 'nota':
      r = { texto: (await c.mudarNota(cmd.nome, cmd.nota, m.quando)).texto };
      break;
    case 'site':
      r = { texto: textoDoSite(c.urlSite) };
      break;
    case 'falta':
      r = { texto: respostaFalta(await c.lerLista(m.quando)) };
      break;
    case 'fila':
      r = { texto: respostaFila(await c.lerLista(m.quando)) };
      break;
    case 'ajuda': {
      const [ajuda, dica] = m.privado ? [TEXTO_AJUDA_PRIVADO, TEXTO_AJUDA_PRIVADO_IA] : [TEXTO_AJUDA, TEXTO_AJUDA_PERGUNTA];
      r = { texto: c.ia ? `${ajuda}\n\n${dica}` : ajuda };
      break;
    }
    case 'sortear':
      r = { texto: await respostaSortear(m, c, cmd.times) };
      break;
    case 'importar':
      r = { texto: await respostaImportar(cmd.texto, m, c) };
      break;
    case 'sim':
      r = { texto: await respostaSim(m, c, remetenteEhJonas(m, c)) };
      break;
    case 'adicionar':
    case 'confirmar':
    case 'remover':
      r = { texto: 'nomes' in cmd ? await respostaNaLista(cmd.tipo, cmd.nomes, cmd.excedeu, m, c) : await respostaNaLista(cmd.tipo, [cmd.nome], false, m, c) };
      break;
    case 'cadastrar':
      r = { texto: (await respostaCadastrar(cmd.pessoas, cmd.excedeu, m, c)).texto };
      break;
    case 'artilheiro':
    case 'garcom':
    case 'ranking':
      r = { texto: await c.consultar(cmd.tipo, m.quando) };
      break;
    case 'times':
      r = { texto: await respostaTimes(m, c) };
      break;
    case 'pergunta': {
      const partes = await respostaPergunta(cmd.texto, m, c);
      r = { texto: partes.join('\n\n') };
      // No privado, a resposta sai em mensagens curtas, uma depois da outra (como gente no WhatsApp).
      if (m.privado && partes.length > 1) emPartes = partes;
      break;
    }
    case 'recusa':
      r = { texto: cmd.texto };
      break;
  }

  // Brincadeira com quem pede, só quando é o Jonas (o "sim" já trocou o texto lá em cima).
  if (cmd.tipo !== 'sim' && remetenteEhJonas(m, c)) r = { ...r, texto: comBrincadeira(cmd, r.texto, c) };

  try {
    if (emPartes) for (const parte of emPartes) await c.enviar(parte);
    else await c.enviar(r.texto);
  } catch (err) {
    c.log(`resposta não saiu (não tenta de novo): ${(err as Error).message}`);
    return null;
  }
  c.freio.registrarResposta();
  // Se grava `estado.ultimo` quem decide é o chamador, depois do ack, com `podeGravarLista`.
  return { texto: r.texto, ehListaCompleta: r.gravar !== undefined, gravar: r.gravar };
}
