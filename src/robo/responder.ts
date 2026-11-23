// Resposta a uma marcação no grupo: decide o texto, envia e cuida do freio e da proposta de sorteio.
// Sem WhatsApp, banco ou IA aqui dentro: tudo chega pelo contexto (os testes usam falsos).
import { normalizarNome } from '@/domain/nome';
import { qtdDeTimes, type QtdDeTimes } from '@/domain/sorteio';
import { textoWhatsApp } from '@/domain/copiarLista';
import { diaMes } from '@/domain/tempo';
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
import type { ConversasPrivadas, Desfazer, Fala } from './conversa-privada';
import { ErroDeFerramenta, semParametros, TextoPronto, type Ferramenta, type Parametros } from './ferramentas';
import { fotografar, haMudanca, juntarNomes, mudancas, type FotoDaLista } from './foto';
import { LIMITE_RESPOSTAS, TEXTO_LIMITE, TEXTO_MUITA_GENTE, type Freio } from './freio';
import { dentroDaJanela } from './janela';
import { montarMensagem } from './mensagem';
import { ERRO_IA, MODELO_PADRAO, TEXTO_IA_FORA, TEXTO_MAX_MUDANCAS } from './ia';
import { EnvioIncerto, ErroDeLimite } from './limite';
import { daQuarta, ehAdmin, MAX_TROCAS, montarProposta, type AnuncioPendente, propostaVencida, TEXTO_SO_ADMIN, votar, type Proposta, type TimesPropostos, type TrocaNosTimes } from './sorteio-zap';

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
  /** Id da mensagem no WhatsApp (para reagir nela); ausente: o robô não reage. */
  id?: string;
  /** Endereço de quem mandou (telefone ou LID), para juntar mensagens quebradas da mesma pessoa. */
  remetente?: string;
  /** Foto ou PDF que veio na mensagem (o texto, se houver, é a legenda). */
  midia?: { id: string; tipo: 'imagem' | 'documento'; mime: string | null };
};

/** Privado: chegou outra mensagem da pessoa enquanto a resposta era feita (ver `juntar.ts`). */
export type Cancelamento = {
  /** Se a resposta em andamento deve ser descartada (para refazer com a mensagem nova junto). */
  pedido: () => boolean;
  /** O responder marca quando descartou (só descarta se nada foi feito, só lido ou respondido). */
  cancelou: boolean;
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
  /** Times já salvos esperando quem propôs mandar no grupo (*mandar*); uma proposta nova descarta. */
  anuncio: { atual: AnuncioPendente | null };
  lerLista: (now: Date) => Promise<EstadoDaSemana>;
  /** `times`: 3 ou 4 (o padrão). `incluirPendentes`: também quem está na lista e não confirmou. */
  propor: (now: Date, times: QtdDeTimes, incluirPendentes?: boolean) => Promise<TimesPropostos | { erro: string }>;
  /** Os times colados (formato do "Importar times" do site), lidos sem gravar. */
  importar: (now: Date, texto: string) => Promise<TimesPropostos | { erro: string }>;
  /** Grava a proposta confirmada como times definitivos, pelo caminho do site. */
  salvar: (now: Date, proposta: Proposta) => Promise<{ ok: true } | { erro: string }>;
  /** Manda um texto no privado de cada organizador, menos os telefones de `exceto`. */
  avisarOrganizadores: (texto: string, exceto: string[]) => Promise<void>;
  /** Manda no grupo configurado (o anúncio dos times confirmados no privado, a lista pedida no privado). */
  anunciarNoGrupo: (texto: string) => Promise<void>;
  /** A lista mandada no grupo pelo privado vira a "última lista" do grupo (a próxima mostra o que mudou desde ela). */
  listaMandadaNoGrupo?: (gravar: NonNullable<Resposta['gravar']>) => void;
  /**
   * Reage na mensagem que chegou (melhor esforço: quem chama não espera nem vê erro). `''` tira a
   * reação. Usado só nas perguntas à IA: ⌛ enquanto pensa; depois ✅ (fez uma ação), nada (só
   * respondeu) ou ❌ (deu erro).
   */
  reagir?: (emoji: string) => void;
  /** O Pix dos diaristas (só com uma cobrança aberta): a situação e marcar um pagamento na mão. */
  pix?: { situacao: () => string | null; marcar: (nome: string, now: Date) => string };
  /** Privado: descartar a resposta se chegar mais mensagem da pessoa antes dela sair. */
  cancelar?: Cancelamento;
  /** Pausa enquanto o limite de envio segura a resposta (nos testes, instantânea). */
  esperar?: (ms: number) => Promise<void>;
  /** `acoes`: as ferramentas de ação desta mensagem (quem mandou já vem amarrado nelas). */
  /** A resposta da IA: um texto ou, em mensagens, a fala e os textos prontos (o privado manda uma por uma). */
  perguntar: (
    texto: string,
    op: { agora: () => Date; acoes: Ferramenta[]; quem: string; ehJonas: boolean; jogador: string | null; privado: boolean; historico?: Fala[] },
  ) => Promise<string | string[]>;
  /** adicionar/confirmar/remover pelo nome, com as regras do jogador no site; `mudanca`: como desfazer. */
  mexerNaLista: (acao: AcaoNaLista, nome: string, now: Date) => Promise<{ texto: string; mudou: boolean; mudanca?: Desfazer }>;
  /** Memória curta do privado (falas e o que dá para desfazer); sem ela, cada mensagem vale sozinha. */
  memoria?: ConversasPrivadas;
  /** Volta as presenças para como estavam (o "desfazer" do privado). */
  desfazer?: (mudancas: Desfazer[], now: Date) => Promise<void>;
  /** Troca jogadores de time numa proposta, sem gravar nada. */
  trocarNosTimes?: (p: Proposta, trocas: TrocaNosTimes[], now: Date) => Promise<{ proposta: Proposta; feitas: string[] } | { erro: string }>;
  consultar: (tipo: Consulta, now: Date) => Promise<string>;
  /** Link temporário de anotar da pelada da semana (quem confere se é organizador é o `responder`). */
  linkAnotar: (quem: string, now: Date) => Promise<{ url: string; data?: string } | { erro: string }>;
  /** Privado: todos os jogadores ativos com a nota. */
  notas: (now: Date) => Promise<string>;
  /** Privado: muda a nota de um jogador achado pelo nome. */
  mudarNota: (nome: string, nota: number, now: Date) => Promise<{ texto: string; mudou: boolean }>;
  /** Endereço do site (sem a barra do fim), para o `site` do privado. */
  urlSite: string;
  /** Cadastra jogadores novos (quem confere se é organizador é o `responder`). */
  cadastrar: (pessoas: PessoaPedida[], now: Date) => Promise<{ texto: string; mudou: boolean }>;
  /**
   * Resolve só com o envio confirmado pelo WhatsApp. `cancelavel` (privado, 1ª parte): enquanto
   * nada saiu, a mensagem é cancelada se isto ficar verdadeiro; aí resolve com `'cancelada'`.
   */
  enviar: (texto: string, op?: { cancelavel?: () => boolean }) => Promise<void | 'cancelada'>;
  /**
   * Várias mensagens numa entrega só (o ZapGate digita uma depois da outra, conta como uma no
   * limite e cancela todas enquanto a 1ª não saiu). Ausente: uma `enviar` por parte.
   */
  enviarPartes?: (partes: string[], op?: { cancelavel?: () => boolean }) => Promise<void | 'cancelada'>;
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
    : cmd.tipo === 'anotar' ? texto.startsWith('📝 Link para anotar as partidas')
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
  return tipo === null || tipo === 'rodada' || tipo === 'pendentes';
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
export const TEXTO_SALVOS = '🏆 Times confirmados e salvos no site (a tela de partidas já libera).';
export const PERGUNTA_MANDAR = '📣 Quer que eu mande os times no grupo? Responda *mandar* quando quiser.';
export const TEXTO_SEM_ANUNCIO = '🤔 Não tem times confirmados esperando para ir ao grupo.';
export const TEXTO_MANDADOS = '📣 Mandei os times no grupo!';
export const TEXTO_MANDAR_NO_PRIVADO = '📣 Mandar os times no grupo é pelo privado do robô.';

/** Tem proposta esperando votos (e ainda valendo)? */
export const temPropostaPendente = (c: ContextoDaResposta, now: Date) => c.proposta.atual !== null && !propostaVencida(c.proposta.atual, now);
/** Enquanto houver proposta esperando votos ou times salvos esperando o *mandar*, o grupo não vê time nenhum. */
export const timesEmSegredo = (c: ContextoDaResposta, now: Date) => temPropostaPendente(c, now) || c.anuncio.atual !== null;

/** Só para quem propôs: os outros organizadores ficam de fora do `avisarOrganizadores`. */
const menosQuemPropos = (c: ContextoDaResposta, quemPropos: string) => c.admins.filter((a) => !ehAdmin(quemPropos, [a]));

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
  // Uma proposta nova descarta times salvos que ainda não foram para o grupo (eles seriam trocados).
  c.anuncio.atual = null;
  // Os outros organizadores só recebem depois que quem propôs aprovar (pedido do usuário).
  // O aviso de dupla separada junta vai só no privado: no grupo a regra não aparece.
  return m.privado && p.aviso ? `${p.texto}\n\n${p.aviso}` : p.texto;
}

/** O que os outros organizadores recebem quando quem propôs aprova: os times (e o aviso de dupla) para confirmar. */
function textoParaConfirmar(p: Proposta): string {
  const titulo = p.texto.split('\n\n')[0];
  const corpo = `${titulo}\n\n${p.blocos}${p.aviso ? `\n\n${p.aviso}` : ''}`;
  return `✅ ${p.quemProposNome} aprovou estes times. Responda *sim* para confirmar: com o seu, eles ficam salvos no site.\n\n${corpo}`;
}

async function respostaSortear(m: MensagemRecebida, c: ContextoDaResposta, times: QtdDeTimes, incluirPendentes = false): Promise<string> {
  const tel = m.remetenteTelefone;
  if (!tel || !ehAdmin(tel, c.admins)) return TEXTO_SO_ADMIN;
  return proporTimes('sorteio', await c.propor(m.quando, times, incluirPendentes), tel, m, c);
}

/** O que a IA recebe quando pede o sorteio sem dizer o que fazer com quem não confirmou: ela pergunta antes. */
export const perguntaPendentes = (nomes: string[]) =>
  `⏳ ${juntarNomes(nomes)} ${nomes.length > 1 ? 'estão' : 'está'} na lista e ainda não ${nomes.length > 1 ? 'confirmaram' : 'confirmou'}. ` +
  'Nada foi sorteado: pergunte ao organizador se o sorteio é com ou sem quem não confirmou e, com a resposta, chame pedir_sorteio de novo com quem_nao_confirmou.';

/** "Mandar a lista no grupo" pelo privado: a lista de sempre (com o que mudou desde a última do grupo). */
async function respostaMandarLista(m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  const tel = m.remetenteTelefone;
  if (!tel || !ehAdmin(tel, c.admins)) return TEXTO_SO_ADMIN_CONFIRMA;
  const r = await respostaLista(m, c);
  await c.anunciarNoGrupo(r.texto);
  if (r.gravar) c.listaMandadaNoGrupo?.(r.gravar);
  return TEXTO_LISTA_MANDADA;
}
export const TEXTO_LISTA_MANDADA = '📣 Mandei a lista no grupo.';

/** importar + times colados: só organizadores e só no privado (no grupo, os times vazariam antes dos votos). */
async function respostaImportar(texto: string, m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  const tel = m.remetenteTelefone;
  if (!tel || !ehAdmin(tel, c.admins)) return TEXTO_SO_ADMIN_IMPORTAR;
  if (!m.privado) return TEXTO_IMPORTAR_NO_PRIVADO;
  return proporTimes('importado', await c.importar(m.quando, texto), tel, m, c);
}

/**
 * "sim" de organizador: um voto na proposta. Quem propôs aprova primeiro (só aí os outros recebem os times);
 * o voto de outro organizador antes disso não conta. No 2º voto, salva no site e pergunta a quem propôs se
 * manda no grupo. Vencida ou recusada pelo site, a proposta acaba.
 */
async function respostaSim(m: MensagemRecebida, c: ContextoDaResposta, jonas: boolean): Promise<string> {
  const p = c.proposta.atual;
  if (!p) return TEXTO_SEM_PROPOSTA;
  const tel = m.remetenteTelefone;
  if (!tel || !ehAdmin(tel, c.admins)) return TEXTO_SO_ADMIN_CONFIRMA;
  const propos = ehAdmin(tel, [p.quemPropos]);
  if (!propos && !p.votos.some((v) => ehAdmin(v, [p.quemPropos])) && !propostaVencida(p, m.quando)) {
    return `⏳ ${p.quemProposNome} ainda não aprovou esses times. Quando aprovar, eu te mando para confirmar.`;
  }
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
      // Quem propôs aprovou: agora sim os outros recebem os times para confirmar.
      if (propos) {
        await avisarOutros(c, textoParaConfirmar(proposta), [tel]);
        return `✅ Aprovado! Mandei para os outros organizadores; falta ${resultado.faltam} confirmar.`;
      }
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
      // Nada vai ao grupo sozinho (pedido do usuário): quem propôs decide quando, com *mandar*.
      c.anuncio.atual = {
        texto: `🏆 Times${proposta.data ? daQuarta(proposta.data) : ' da noite'}:\n\n${proposta.blocos}`,
        quemPropos: proposta.quemPropos,
        quemProposNome: proposta.quemProposNome,
        peladaId: proposta.peladaId,
        criadoEm: m.quando,
      };
      const votouQuemPropos = ehAdmin(tel, [proposta.quemPropos]);
      const outros = menosQuemPropos(c, proposta.quemPropos).filter((a) => !ehAdmin(tel, [a]));
      if (!votouQuemPropos) await avisarOutros(c, `🏆 ${nome} confirmou e os times estão salvos no site.\n${PERGUNTA_MANDAR}`, menosQuemPropos(c, proposta.quemPropos));
      if (outros.length) {
        await avisarOutros(c, `🏆 Times confirmados e salvos no site. ${proposta.quemProposNome} decide quando mandar no grupo.`, c.admins.filter((a) => !outros.includes(a)));
      }
      const salvos = jonas && m.privado ? SALVOS_CALVINHO[Math.floor((c.rng ?? Math.random)() * SALVOS_CALVINHO.length)] : TEXTO_SALVOS;
      if (!votouQuemPropos) return `${salvos}\n${proposta.quemProposNome} decide quando mandar no grupo.`;
      return m.privado ? `${salvos}\n${PERGUNTA_MANDAR}` : `${salvos}\nMande *mandar* no meu privado para eu postar os times aqui.`;
    }
  }
}

/**
 * "times": com proposta esperando votos ou times salvos esperando o *mandar*, o grupo não vê nada; no privado,
 * o organizador vê a proposta (e os votos) ou os times salvos.
 */
async function respostaTimes(m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  const p = c.proposta.atual;
  if (timesEmSegredo(c, m.quando)) {
    if (!m.privado) return TEXTO_TIMES_INDEFINIDOS;
    if (p && temPropostaPendente(c, m.quando)) return `⏳ Times esperando confirmação (${p.votos.length} de 2):\n\n${p.texto}`;
    const a = c.anuncio.atual!;
    return `✅ Times salvos, esperando ${a.quemProposNome} mandar no grupo:\n\n${a.texto}`;
  }
  return c.consultar('times', m.quando);
}

/** *mandar*: só quem propôs os times salvos, no privado; aí sim os times vão ao grupo. */
async function respostaMandar(m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  const tel = m.remetenteTelefone;
  if (!tel || !ehAdmin(tel, c.admins)) return TEXTO_SO_ADMIN_CONFIRMA;
  if (!m.privado) return TEXTO_MANDAR_NO_PRIVADO;
  const a = c.anuncio.atual;
  if (!a) return TEXTO_SEM_ANUNCIO;
  if (!ehAdmin(tel, [a.quemPropos])) return `🔐 Só ${a.quemProposNome}, que propôs os times, manda no grupo.`;
  try {
    await c.anunciarNoGrupo(a.texto);
  } catch (err) {
    c.log(`anúncio dos times no grupo não saiu: ${(err as Error).message}`);
    return '😕 Não consegui mandar no grupo agora. Tente *mandar* de novo daqui a pouco.';
  }
  c.anuncio.atual = null;
  await avisarOutros(c, `📣 ${a.quemProposNome} mandou os times no grupo.`, [tel]);
  return TEXTO_MANDADOS;
}

/** Como terminou uma pergunta à IA, para a reação final na mensagem. */
export type Desfecho = 'acao' | 'resposta' | 'erro';

/** A reação que fica na mensagem depois da resposta: ✅ fez algo, nada se só respondeu, ❌ erro. */
export const REACAO_FINAL: Record<Desfecho, string> = { acao: '✅', resposta: '', erro: '❌' };
export const REACAO_PENSANDO = '⏳';

/** Comando que não é nenhum dos prontos: sem IA, a lista de comandos. `desfecho` só quando a IA foi chamada. */
async function respostaPergunta(texto: string, m: MensagemRecebida, c: ContextoDaResposta): Promise<{ partes: string[]; desfecho?: Desfecho }> {
  if (!c.ia) return { partes: [m.privado ? TEXTO_AJUDA_PRIVADO : TEXTO_AJUDA] };
  if (!c.freio.podePerguntar()) return { partes: [TEXTO_LIMITE] };
  const marca = { entrouOuConfirmou: false };
  // Uma ação que rodou sem erro vira ✅ no fim (as de leitura não contam: não estão aqui).
  let fez = false;
  const acoes = (m.privado ? [...ferramentasDeAcao(m, c, marca), ...ferramentasDoOrganizador(m, c)] : ferramentasDeAcao(m, c, marca)).map(
    (f): Ferramenta => ({
      ...f,
      executar: async (args) => {
        const r = await f.executar(args);
        fez = true;
        return r;
      },
    }),
  );
  // A IA leva alguns segundos: a ampulheta mostra logo que a mensagem foi vista.
  c.reagir?.(REACAO_PENSANDO);
  // No privado, a IA vê as últimas falas: "troca o Caio pelo Jonas" e "desfaz" dependem do que veio antes.
  const historico = m.privado && m.remetenteTelefone ? c.memoria?.historico(m.remetenteTelefone, m.quando) : undefined;
  const r = await c.perguntar(texto, {
    agora: () => m.quando,
    acoes,
    quem: quemPediu(m),
    ehJonas: remetenteEhJonas(m, c),
    jogador: jogadorDoRemetente(m, c),
    privado: m.privado === true,
    ...(historico?.length ? { historico } : {}),
  });
  c.freio.registrarPergunta();
  const partes = Array.isArray(r) ? r : [r];
  const desfecho: Desfecho = fez ? 'acao' : partes.length === 1 && (partes[0] === ERRO_IA || partes[0] === TEXTO_IA_FORA) ? 'erro' : 'resposta';
  if (!marca.entrouOuConfirmou) return { partes, desfecho };
  // Entrou ou confirmou alguém: a lista atual vai junto, se a resposta ainda não a trouxe.
  const lista = await listaAtual(m, c);
  return { partes: partes.some((p) => p.includes(lista)) ? partes : [...partes, lista], desfecho };
}

/** Quem pediu, para o "pedido por" (nunca o telefone). */
const quemPediu = (m: MensagemRecebida) => m.remetenteNome?.trim() || 'alguém';

/** Quem entra ou confirma quer conferir a lista: depois dessas mudanças, a lista atual vai junto. */
const MOSTRA_LISTA: readonly AcaoNaLista[] = ['adicionar', 'confirmar'];

/**
 * A lista que uma resposta mostrou (depois de uma entrada ou confirmação): no grupo, ela vira a
 * "última lista" do robô, para a rodada da meia hora não mandar a mesma lista de novo.
 */
const listaMostrada = new WeakMap<MensagemRecebida, FotoDaLista>();

/** A lista atual, como o "Copiar lista" do site, para ir depois de uma entrada ou confirmação. */
async function listaAtual(m: MensagemRecebida, c: ContextoDaResposta): Promise<string> {
  const lista = await c.lerLista(m.quando);
  listaMostrada.set(m, fotografar(lista));
  return textoWhatsApp(lista, lista.data);
}

/** adicionar/confirmar/remover: qualquer pessoa do grupo pode; a mudança na lista mostra quem pediu. */
async function mudarNaLista(acao: AcaoNaLista, nome: string, m: MensagemRecebida, c: ContextoDaResposta): Promise<{ texto: string; mudou: boolean }> {
  const feito = await c.mexerNaLista(acao, nomeDoPedido(nome, m, c), m.quando);
  if (!feito.mudou) return { texto: feito.texto, mudou: false };
  // No privado, a mudança fica guardada para o "desfazer" (todas as desta mensagem juntas).
  if (m.privado && feito.mudanca) mudancasDaMensagem.set(m, [...(mudancasDaMensagem.get(m) ?? []), feito.mudanca]);
  return { texto: `${feito.texto} (pedido por ${quemPediu(m)})`, mudou: true };
}

/** As mudanças na lista feitas por cada mensagem do privado, até a resposta sair. */
const mudancasDaMensagem = new WeakMap<MensagemRecebida, Desfazer[]>();

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

/** Opcionais, como o `periodo` do ranking: omitido, 4 times. Qualquer outro valor também vira 4. */
const comTimesEPendentes: Parametros = {
  type: 'object',
  properties: {
    times: { type: 'integer', enum: [3, 4], description: 'Quantos times: 3 ou 4. Omitido: 4. Use 3 só quando pedirem 3 times.' },
    quem_nao_confirmou: {
      type: 'string',
      enum: ['incluir', 'deixar_de_fora'],
      description: 'Quem está na lista e não confirmou: "incluir" no sorteio ou "deixar_de_fora". Só passe depois que o organizador responder; omitido, o robô diz se tem alguém assim para você perguntar.',
    },
  },
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
  // O texto da consulta vai inteiro no fim da resposta, pelo robô (a IA dizia "aqui está o ranking" e não mandava).
  const consulta = (tipo: Consulta, nome: string, descricao: string): Ferramenta => ({
    nome,
    descricao,
    parametros: semParametros,
    executar: async () => new TextoPronto(await c.consultar(tipo, m.quando), 'lista'),
  });
  return [
    naLista('adicionar', 'adicionar_jogador', 'Põe um jogador já cadastrado na lista da semana (ou na fila, se a lista estiver cheia). Devolve o texto para o grupo.'),
    naLista('confirmar', 'confirmar_jogador', 'Confirma ("vou") um jogador que já está na lista da semana. Devolve o texto para o grupo.'),
    naLista('remover', 'remover_jogador', 'Tira um jogador da lista ou da fila ("não vou"). Devolve o texto para o grupo.'),
    {
      nome: 'ver_lista',
      descricao: 'Mostra a lista completa da semana nesta conversa (com o que mudou desde a última do grupo). O robô manda o texto sozinho. Não manda nada no grupo.',
      parametros: semParametros,
      executar: async () => new TextoPronto((await respostaLista(m, c)).texto, 'lista'),
    },
    {
      nome: 'quem_falta_confirmar',
      descricao: 'Quem da lista ainda não confirmou.',
      parametros: semParametros,
      executar: async () => new TextoPronto(respostaFalta(await c.lerLista(m.quando)), 'lista'),
    },
    {
      nome: 'ver_fila',
      descricao: 'A fila de espera da semana.',
      parametros: semParametros,
      executar: async () => new TextoPronto(respostaFila(await c.lerLista(m.quando)), 'lista'),
    },
    {
      nome: 'ver_times',
      descricao: 'Os times definitivos da pelada da semana, se já foram confirmados e salvos. O robô manda o texto sozinho.',
      parametros: semParametros,
      executar: async () => new TextoPronto(await respostaTimes(m, c), 'lista'),
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
      descricao: 'Gera o link temporário para anotar as partidas da pelada da semana (sem senha), só para os organizadores (o código confere quem mandou). Pode ser pedido em qualquer dia. Devolve o texto para a conversa.',
      parametros: semParametros,
      async executar() {
        const r = await respostaAnotar(m, c);
        if (!r.ok) throw new ErroDeFerramenta(r.texto);
        return new TextoPronto(r.texto, 'acao');
      },
    },
    {
      nome: 'pedir_sorteio',
      descricao:
        'Sorteia os times da pelada da semana (a próxima quarta) sem salvar, em qualquer dia, só para os organizadores (o código confere quem mandou). Entram os confirmados; quem está na lista sem confirmar só entra com quem_nao_confirmou "incluir". Quem pediu aprova respondendo "sim".',
      parametros: comTimesEPendentes,
      sorteio: true,
      async executar(args) {
        const a = (args ?? {}) as { times?: unknown; quem_nao_confirmou?: unknown };
        const escolha = a.quem_nao_confirmou === 'incluir' || a.quem_nao_confirmou === 'deixar_de_fora' ? a.quem_nao_confirmou : null;
        // Sem escolha e com gente sem confirmar: não sorteia, a IA pergunta antes (sortear sem avisar deixava gente de fora).
        if (!escolha && ehAdmin(m.remetenteTelefone ?? '', c.admins)) {
          const pendentes = (await c.lerLista(m.quando)).principal.filter((i) => !i.confirmado).map((i) => i.nome);
          if (pendentes.length) throw new ErroDeFerramenta(perguntaPendentes(pendentes));
        }
        const antes = c.proposta.atual;
        const texto = await respostaSortear(m, c, qtdDeTimes(a.times), escolha === 'incluir');
        const nova = c.proposta.atual;
        // Recusa (não é admin) ou erro do sorteio: nada guardado, o modelo explica.
        if (!nova || nova === antes) throw new ErroDeFerramenta(texto);
        return new TextoPronto(texto, 'sorteio', () => {
          if (c.proposta.atual === nova) c.proposta.atual = null;
        });
      },
    },
  ];
}

/** Um aviso no grupo cabe em poucas mensagens curtas. */
export const TAM_MAX_AVISO = 600;

const comTexto: Parametros = {
  type: 'object',
  properties: { texto: { type: 'string', description: 'O aviso, no jeito do grupo (mensagens curtas separadas por linha em branco).' } },
  required: ['texto'],
  additionalProperties: false,
};

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
    {
      nome: 'ver_notas',
      descricao: 'Todos os jogadores ativos com a nota (0 a 5). Só no privado dos organizadores. O robô manda o texto sozinho.',
      parametros: semParametros,
      executar: async () => new TextoPronto(await c.notas(m.quando), 'lista'),
    },
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
    {
      nome: 'link_do_site',
      descricao: 'O endereço do site da pelada e da área dos organizadores. O robô manda o texto sozinho.',
      parametros: semParametros,
      executar: async () => new TextoPronto(textoDoSite(c.urlSite), 'lista'),
    },
    {
      nome: 'mandar_lista_no_grupo',
      altera: true,
      descricao:
        'Manda a lista completa da semana no grupo (encaminhar, postar, mandar lá). Use só quando o organizador pedir para mandar a lista no grupo; ver_lista só mostra aqui. Devolve o texto para a conversa.',
      parametros: semParametros,
      async executar() {
        try {
          return new TextoPronto(await respostaMandarLista(m, c), 'acao');
        } catch (err) {
          c.log(`lista no grupo não saiu: ${(err as Error).message}`);
          throw new ErroDeFerramenta('Não consegui mandar no grupo agora (entre 23h e 8h o robô não manda nada no grupo). Nada foi mandado.');
        }
      },
    },
    {
      nome: 'confirmar_times',
      descricao: 'O voto deste organizador nos times propostos (como responder "sim"). Use só quando ele disser que confirma ou aprova os times. Devolve o texto para a conversa.',
      parametros: semParametros,
      async executar() {
        return new TextoPronto(await respostaSim(m, c, remetenteEhJonas(m, c)), 'acao');
      },
    },
    {
      nome: 'mandar_times_no_grupo',
      descricao: 'Manda no grupo os times já confirmados e salvos. Só quem propôs os times pode; use quando ele pedir para mandar/postar no grupo. Devolve o texto para a conversa.',
      parametros: semParametros,
      async executar() {
        return new TextoPronto(await respostaMandar(m, c), 'acao');
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
    {
      nome: 'trocar_nos_times',
      sorteio: true,
      descricao:
        'Troca jogadores de time nos times propostos (sorteados ou importados) que ainda esperam aprovação: cada par muda de time um com o outro. Use quando o organizador pedir "troca o Caio pelo Jonas", "põe o Caio no time do Jonas" ou parecido, logo depois de um sorteio. Não mexe na lista. Só quem propôs pode; depois da troca ele aprova de novo. Devolve o texto para a conversa.',
      parametros: comTrocas,
      async executar(args) {
        const bruto = args && typeof args === 'object' ? (args as { trocas?: unknown }).trocas : undefined;
        const r = await respostaTrocar(typeof bruto === 'string' ? lerTrocas(bruto) : [], m, c);
        if ('erro' in r) throw new ErroDeFerramenta(r.erro);
        const nova = c.proposta.atual;
        return new TextoPronto(r.texto, 'sorteio', () => {
          if (c.proposta.atual === nova) c.proposta.atual = r.antes;
        });
      },
    },
    {
      nome: 'desfazer_mudanca_na_lista',
      altera: true,
      descricao:
        'Desfaz a última mudança na lista que o robô fez por esta conversa (entrada, confirmação ou saída): cada um volta ao lugar e ao estado de antes, e quem tinha subido da fila volta para a fila. Use quando o organizador pedir para desfazer, voltar ou anular o que foi feito na lista. Devolve o texto para a conversa.',
      parametros: semParametros,
      async executar() {
        const tel = m.remetenteTelefone;
        const mudancas = tel ? c.memoria?.tirarDesfazer(tel, m.quando) : null;
        if (!mudancas?.length || !c.desfazer) throw new ErroDeFerramenta(TEXTO_NADA_PARA_DESFAZER);
        // Da última para a primeira: se o mesmo jogador mudou duas vezes, vale a foto mais antiga.
        await c.desfazer([...mudancas].reverse(), m.quando);
        const nomes = [...new Set(mudancas.map((x) => x.nome))];
        return new TextoPronto(`↩️ Desfeito: ${juntarNomes(nomes)} ${nomes.length > 1 ? 'voltaram' : 'voltou'} como estava.\n\n${await listaAtual(m, c)}`, 'acao');
      },
    },
    {
      nome: 'mandar_aviso_no_grupo',
      altera: true,
      descricao:
        'Manda no grupo um aviso escrito por você a pedido do organizador (ex.: "avisa lá no grupo que a nota do Fernando mudou"). Escreva o aviso no jeito do grupo, curto, em até 3 mensagens separadas por linha em branco. Nunca mande sem o organizador pedir para avisar o grupo. Para a lista ou os times, use as ferramentas próprias.',
      parametros: comTexto,
      async executar(args) {
        const { texto } = args as { texto?: unknown };
        if (typeof texto !== 'string' || !texto.trim()) throw new ErroDeFerramenta('Faltou o texto do aviso.');
        if (texto.length > TAM_MAX_AVISO) throw new ErroDeFerramenta(`O aviso passou de ${TAM_MAX_AVISO} letras; resuma.`);
        try {
          await c.anunciarNoGrupo(texto.trim());
        } catch (err) {
          c.log(`aviso no grupo não saiu: ${(err as Error).message}`);
          throw new ErroDeFerramenta('Não consegui mandar no grupo agora (entre 23h e 8h o robô não manda nada no grupo). Nada foi mandado.');
        }
        return '📣 Aviso mandado no grupo.';
      },
    },
    {
      nome: 'ver_pagamentos_do_pix',
      descricao: 'Quem dos diaristas da última pelada já pagou o Pix e quem falta. O robô manda o texto sozinho.',
      parametros: semParametros,
      async executar() {
        const situacao = c.pix?.situacao();
        return situacao ? new TextoPronto(situacao, 'lista') : 'Não tem cobrança de Pix aberta agora (ela abre depois da pelada, com o lembrete).';
      },
    },
    {
      nome: 'marcar_pagamento_do_pix',
      altera: true,
      descricao:
        'Marca que um diarista pagou o Pix da última pelada (pagou em dinheiro, ou o comprovante não foi reconhecido). Só quando o organizador disser que a pessoa pagou. Devolve o texto para a conversa.',
      parametros: comNome,
      async executar(args) {
        const { nome } = args as { nome?: unknown };
        if (typeof nome !== 'string' || !nome.trim()) throw new ErroDeFerramenta('Faltou o nome de quem pagou.');
        if (!c.pix) return 'Não tem cobrança de Pix aberta agora.';
        return new TextoPronto(c.pix.marcar(nome.trim(), m.quando), 'acao');
      },
    },
  ];
}

const comTrocas: Parametros = {
  type: 'object',
  properties: {
    trocas: {
      type: 'string',
      description: 'Cada troca como "Nome por Nome", separadas por ponto e vírgula, ex.: "Caio por Jonas; Pedro por Paulo". Os nomes como a pessoa escreveu.',
    },
  },
  required: ['trocas'],
  additionalProperties: false,
};

/** "Caio por Jonas; Pedro x Paulo" → os pares (no máximo `MAX_TROCAS`). */
export function lerTrocas(texto: string): TrocaNosTimes[] {
  return texto
    .split(/[;\n]/)
    .map((t) => t.trim().split(/\s+(?:por|pelo|pela|com|x|e|↔|<->)\s+/iu))
    .filter((par) => par.length === 2 && par[0].trim() && par[1].trim())
    .map(([de, por]) => ({ de: de.trim().slice(0, TAM_MAX_NOME_PEDIDO), por: por.trim().slice(0, TAM_MAX_NOME_PEDIDO) }))
    .slice(0, MAX_TROCAS);
}

export const TEXTO_SEM_TIMES_PARA_TROCAR = '🤔 Não tem times esperando aprovação para trocar. Peça um sorteio novo.';
export const TEXTO_NADA_PARA_DESFAZER =
  '🤔 Não tenho mudança na lista para desfazer: só dá para desfazer o que eu mudei por esta conversa, nos últimos 30 minutos.';

/** Troca jogadores de time na proposta esperando aprovação. Só quem propôs; a aprovação dele (e as outras) recomeça. */
async function respostaTrocar(trocas: TrocaNosTimes[], m: MensagemRecebida, c: ContextoDaResposta): Promise<{ texto: string; antes: Proposta } | { erro: string }> {
  const tel = m.remetenteTelefone;
  if (!tel || !ehAdmin(tel, c.admins) || !c.trocarNosTimes) return { erro: TEXTO_SO_ADMIN };
  const p = c.proposta.atual;
  if (!p || propostaVencida(p, m.quando)) return { erro: TEXTO_SEM_TIMES_PARA_TROCAR };
  if (!ehAdmin(tel, [p.quemPropos])) return { erro: `🔐 Só ${p.quemProposNome}, que propôs os times, troca jogadores. Você pode sortear de novo.` };
  if (!trocas.length) return { erro: '🤔 Não entendi quem troca com quem. Mande assim: Caio por Jonas.' };
  const r = await c.trocarNosTimes(p, trocas, m.quando);
  if ('erro' in r) return r;
  c.proposta.atual = r.proposta;
  // Quem propôs já tinha aprovado: os outros receberam os times antigos e precisam saber que mudou.
  if (p.votos.some((v) => ehAdmin(v, [p.quemPropos]))) {
    await avisarOutros(c, `🔁 ${p.quemProposNome} trocou jogadores nos times que eu mandei, então aqueles não valem mais. Quando ele aprovar os novos, eu mando para você confirmar.`, [tel]);
  }
  const corpo = r.proposta.aviso ? `${r.proposta.texto}\n\n${r.proposta.aviso}` : r.proposta.texto;
  return { texto: `🔁 Troquei: ${r.feitas.join(', ')}.\n\n${corpo}`, antes: p };
}

export const TEXTO_SO_ADMIN_ANOTAR = '🔐 Só os organizadores podem gerar o link de anotar.';
/** "de quarta, 18/11" (sem data, "da pelada"). */
const inicioLinkAnotar = (data?: string) => `📝 Link para anotar as partidas${data ? ` de quarta, ${diaMes(data)}` : ' da pelada'}:`;
/** O link vence às 3h do dia seguinte à pelada. */
function validadeDoLink(data?: string): string {
  if (!data) return 'Vale até as 3h da manhã depois da pelada';
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `Vale até as 3h de quinta, ${diaMes(d.toISOString().slice(0, 10))}`;
}

/** anotar: só organizadores (pelo telefone), no grupo ou no privado; no grupo, todo mundo fica com o link. */
async function respostaAnotar(m: MensagemRecebida, c: ContextoDaResposta): Promise<{ texto: string; ok: boolean }> {
  if (!m.remetenteTelefone || !ehAdmin(m.remetenteTelefone, c.admins)) return { texto: TEXTO_SO_ADMIN_ANOTAR, ok: false };
  const r = await c.linkAnotar(quemPediu(m), m.quando);
  if ('erro' in r) return { texto: r.erro, ok: false };
  return {
    texto: `${inicioLinkAnotar(r.data)}\n${r.url}\nAbre direto na tela de partidas, sem senha. ${validadeDoLink(r.data)}; um link novo cancela este. (pedido por ${quemPediu(m)})`,
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
  const tel = m.remetenteTelefone;
  c.memoria?.guardarDesfazer(tel, mudancasDaMensagem.get(m) ?? [], m.quando);
  if (r) c.memoria?.registrar(tel, m.texto, r.texto, m.quando);
  return r && { ...r, ehListaCompleta: false, gravar: undefined };
}

/** Comandos que não mudam nada: podem ser descartados e refeitos (a pergunta, só se a IA não agiu). */
const SO_LEITURA = new Set<Comando['tipo']>(['lista', 'notas', 'site', 'falta', 'fila', 'ajuda', 'artilheiro', 'garcom', 'ranking', 'times', 'pergunta', 'recusa']);

/** Quanto, no total, uma resposta espera o limite de envio liberar antes de desistir. */
export const ESPERA_MAXIMA_LIMITE_MS = 10 * 60_000;

const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * Envia; se o limite de envio (por minuto ou por hora) segurar, põe a ⌛ na mensagem (uma vez) e tenta
 * de novo quando o limite disser, até `ESPERA_MAXIMA_LIMITE_MS` no total. O limite do dia não espera.
 */
async function enviarEsperandoLimite(
  enviar: () => Promise<void | 'cancelada'>,
  c: ContextoDaResposta,
  ampulheta: { posta: boolean },
): Promise<void | 'cancelada'> {
  let esperou = 0;
  for (;;) {
    try {
      return await enviar();
    } catch (err) {
      if (!(err instanceof ErroDeLimite) || err.tipo === 'dia') throw err;
      // Um pouco além do que o limite pede: a vaga abre de verdade e a próxima tentativa passa.
      const espera = Math.max(5_000, err.esperarMs + 2_000);
      if (esperou + espera > ESPERA_MAXIMA_LIMITE_MS) throw err;
      if (!ampulheta.posta) {
        c.reagir?.(REACAO_PENSANDO);
        ampulheta.posta = true;
      }
      c.log(`resposta segurada pelo limite (por ${err.tipo}); tenta de novo em ${Math.round(espera / 1000)} s`);
      await (c.esperar ?? dormir)(espera);
      esperou += espera;
    }
  }
}

/** O comando já liberado: monta o texto, envia, registra no freio. */
async function responderComando(cmd: Comando, m: MensagemRecebida, c: ContextoDaResposta): Promise<Resposta | null> {
  let r: Omit<Resposta, 'ehListaCompleta'>;
  let emPartes: string[] | null = null;
  let desfecho: Desfecho | undefined;
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
    case 'mandar':
      r = { texto: await respostaMandar(m, c) };
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
      const pergunta = await respostaPergunta(cmd.texto, m, c);
      const partes = pergunta.partes;
      desfecho = pergunta.desfecho;
      r = { texto: partes.join('\n\n') };
      // No privado, a resposta sai em mensagens curtas, uma depois da outra (como gente no WhatsApp).
      if (m.privado && partes.length > 1) emPartes = partes;
      break;
    }
    case 'recusa':
      r = { texto: cmd.texto };
      break;
  }

  // A resposta trouxe a lista atual (entrou ou confirmou alguém): conta como a última lista do grupo.
  const mostrada = listaMostrada.get(m);
  if (!r.gravar && mostrada) r = { ...r, gravar: { tipo: 'rodada', foto: mostrada } };

  // Brincadeira com quem pede, só quando é o Jonas (o "sim" já trocou o texto lá em cima).
  if (cmd.tipo !== 'sim' && remetenteEhJonas(m, c)) r = { ...r, texto: comBrincadeira(cmd, r.texto, c) };

  // Chegou mais mensagem da pessoa: se nada foi feito, a resposta sai depois, com tudo junto. Vale
  // até a 1ª parte sair (o ZapGate cancela a mensagem enquanto ela "lê" ou "digita").
  const cancelar = c.cancelar;
  const cancelavel = cancelar && SO_LEITURA.has(cmd.tipo) && desfecho !== 'acao' ? () => cancelar.pedido() : undefined;
  const descartar = () => {
    cancelar!.cancelou = true;
    c.log('resposta descartada: chegou outra mensagem da pessoa; refaz com tudo junto');
    return null;
  };
  if (cancelavel?.()) return descartar();
  // Na pergunta à IA a ampulheta já está na mensagem; num comando, só aparece se o limite segurar.
  const ampulheta = { posta: desfecho !== undefined };
  /** A resposta saiu (inteira ou em parte): a reação final e o freio. */
  const terminar = (): Resposta => {
    // Depois da resposta (não antes: o ✅ não pode aparecer com o texto ainda sendo digitado).
    if (desfecho) c.reagir?.(REACAO_FINAL[desfecho]);
    else if (ampulheta.posta) c.reagir?.(REACAO_FINAL.resposta);
    c.freio.registrarResposta();
    // Se grava `estado.ultimo` quem decide é o chamador, depois do ack, com `podeGravarLista`.
    return { texto: r.texto, ehListaCompleta: r.gravar !== undefined, gravar: r.gravar };
  };
  const partes = emPartes ?? [r.texto];
  const op = cancelavel ? { cancelavel } : undefined;
  let enviadas = 0;
  try {
    if (partes.length > 1 && c.enviarPartes) {
      const enviarPartes = c.enviarPartes;
      if ((await enviarEsperandoLimite(() => (op ? enviarPartes(partes, op) : enviarPartes(partes)), c, ampulheta)) === 'cancelada') return descartar();
    } else {
      for (const [i, parte] of partes.entries()) {
        const enviar = () => (i === 0 && op ? c.enviar(parte, op) : c.enviar(parte));
        if ((await enviarEsperandoLimite(enviar, c, ampulheta)) === 'cancelada') return descartar();
        enviadas++;
      }
    }
  } catch (err) {
    // Parte da resposta já chegou (ou pode ter chegado): não é erro para quem pediu (nada de ❌).
    if (enviadas > 0 || err instanceof EnvioIncerto) {
      c.log(`resposta saiu pela metade (${enviadas} de ${partes.length} partes): ${(err as Error).message}`);
      return terminar();
    }
    c.log(`resposta não saiu (não tenta de novo): ${(err as Error).message}`);
    // Segurada além da espera máxima (ou limite do dia): o ❌ diz que não vai sair, em vez de ⌛ para sempre.
    if (ampulheta.posta || err instanceof ErroDeLimite) c.reagir?.(REACAO_FINAL.erro);
    return null;
  }
  return terminar();
}
