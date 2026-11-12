// "Importar times": os times sorteados fora do site, colados da mensagem do WhatsApp. Aqui só o texto e a
// conta com os jogadores ativos (sem banco): a prévia da tela e o salvar do servidor chamam as mesmas funções.
import { acharJogador, normalizarNome, sugerirNome } from './nome';
import { CORES, JOGADORES_POR_TIME, type JogadorNota } from './sorteio';

export const TEXTO_2_A_4_TIMES = 'Cole de 2 a 4 times.';
/** Bem mais que 4 times com nomes e cabeçalhos; só barra colagem absurda. */
export const TAM_MAX_TEXTO_COLADO = 4000;
const NOTA_DO_COMPLETE = 3;
const MIN_TIMES = 2;

/** `linha`: o índice da linha no texto colado (a tela troca o nome nela pela sugestão). */
export type NomeColado = { nome: string; linha: number };
export type TimeColado = { nomes: NomeColado[]; completes: number[] };

const notaValida = (n: number) => Number.isFinite(n) && n >= 0 && n <= 5 && Number.isInteger(n * 2);

/**
 * O que não é o texto da linha: o prefixo de mensagem copiada do WhatsApp ("[04/11, 20:31] Pepe: "), a formatação
 * (*negrito*, _itálico_, ~riscado~), as marcas da lista ((M), (D), (?)) e os emojis. Espaços repetidos viram um.
 */
export function limparLinha(linha: string): string {
  return linha
    .replace(/^\s*\[[^\]]*\]\s*[^:]{1,40}:\s*/u, '')
    .replace(/[*_~]/g, '')
    .replace(/\((?:M|D|\?)\)/gi, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Time 1 (12.0)", "time", "⚽ Time 2:" abrem um time; e também "🔵 Azul (7,0)", o cabeçalho da proposta do robô. */
const ehComecoDeTime = (linha: string) =>
  /^[^\p{L}\d]*time\b/iu.test(linha) || /^[^\p{L}\d]*(?:azul|laranja|verde|preto)\s*\(\s*\d+(?:[.,]\d+)?\s*\)$/iu.test(linha);
/**
 * Cabeçalho ou conta, não é jogador: "Pelada…", data ("04/11"), hora ("20:30"), um rótulo no começo ("Diferença: 0,5",
 * "Times sorteados:") ou pergunta (termina em "?").
 */
const ehCabecalho = (linha: string) =>
  /^pelada\b/i.test(linha) || /\d{1,2}\/\d{1,2}/.test(linha) || /\b\d{1,2}:\d{2}\b/.test(linha) || /^[\p{L} ]+:/u.test(linha) || /\?$/.test(linha);
/** Nome de jogador tem poucas palavras; mais que isto é frase ("Confirma? Responda sim em até 10 minutos"). */
const MAX_PALAVRAS_NO_NOME = 5;

/** Tira o marcador ("- ", "• ", "3. ", "2 - ", "1) ") e a nota do fim ("4.5", "4,5", "(4.5)") da linha já limpa. */
function lerLinha(linha: string): { nome: string; nota: number | null } {
  const semMarca = linha
    .replace(/^[-•–]\s*/, '')
    .replace(/^\d+\s*[.)\-–]\s*/, '')
    .trim();
  const m = /^(.*?)\s+\(?(\d+(?:[.,]\d+)?)\)?$/.exec(semMarca);
  if (!m) return { nome: semMarca, nota: null };
  return { nome: m[1].trim(), nota: Number(m[2].replace(',', '.')) };
}

/**
 * "Você quis dizer X?": troca o nome escrito pelo `novo` na linha `linha` do texto colado. Tolera espaços repetidos e a
 * formatação do WhatsApp entre as palavras; se mesmo assim não achar, a linha vira só o nome novo.
 */
export function trocarNomeNaLinha(texto: string, linha: number, escrito: string, novo: string): string {
  const linhas = texto.split(/\r?\n/);
  if (linha < 0 || linha >= linhas.length) return texto;
  const palavras = escrito.split(' ').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(palavras.join('[\\s*_~]+'), 'u');
  linhas[linha] = re.test(linhas[linha]) ? linhas[linha].replace(re, novo) : novo;
  return linhas.join('\n');
}

/**
 * Texto colado → times. Uma linha "Time…" começa um time novo; sem ela, linha em branco separa os times. Cada linha de
 * jogador perde a numeração e a nota (a nota que vale é a do cadastro). "COMPLETE" vira vaga com a nota escrita (3,0
 * sem nota). De 2 a 4 times, cada um com pelo menos um jogador.
 */
export function lerTimesColados(
  texto: string,
): { ok: true; times: TimeColado[]; ignoradas: string[] } | { ok: false; erro: string } {
  const times: TimeColado[] = [];
  /** Linhas com texto que não viraram jogador nem time (cabeçalho, conta, frase): a tela mostra, nada some escondido. */
  const ignoradas: string[] = [];
  let atual: TimeColado | null = null;
  const fechar = () => {
    if (atual && (atual.nomes.length || atual.completes.length)) times.push(atual);
    atual = null;
  };
  const linhas = texto.split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    if (!linhas[i].trim()) {
      fechar();
      continue;
    }
    const linha = limparLinha(linhas[i]);
    // Só o prefixo de uma mensagem copiada ("[04/11, 20:31] Pepe:"): nem separa nem conta.
    if (!linha) continue;
    if (ehComecoDeTime(linha)) {
      fechar();
      atual = { nomes: [], completes: [] };
      continue;
    }
    const { nome, nota } = lerLinha(linha);
    if (ehCabecalho(linha) || !/\p{L}/u.test(nome) || nome.split(' ').length > MAX_PALAVRAS_NO_NOME) {
      ignoradas.push(linhas[i].trim());
      continue;
    }
    atual ??= { nomes: [], completes: [] };
    if (normalizarNome(nome) === 'complete') {
      const n = nota ?? NOTA_DO_COMPLETE;
      if (!notaValida(n)) return { ok: false, erro: `Nota do COMPLETE inválida: ${String(n).replace('.', ',')}. Use de 0 a 5, de 0,5 em 0,5.` };
      atual.completes.push(n);
    } else {
      atual.nomes.push({ nome, linha: i });
    }
  }
  fechar();
  if (times.length < MIN_TIMES || times.length > CORES.length) return { ok: false, erro: TEXTO_2_A_4_TIMES };
  if (times.some((t) => t.nomes.length === 0)) return { ok: false, erro: 'Cada time precisa de pelo menos um jogador.' };
  const cheio = times.findIndex((t) => t.completes.length > 0 && t.nomes.length + t.completes.length > JOGADORES_POR_TIME);
  if (cheio >= 0) return { ok: false, erro: `Time com COMPLETE fecha em 4: tire um COMPLETE do time ${cheio + 1}.` };
  return { ok: true, times, ignoradas };
}

export type NomeNaPrevia = { escrito: string; linha: number } & (
  | { tipo: 'ok'; jogador: JogadorNota; repetido: boolean }
  /** Sem cadastro ativo com esse nome; `sugestao`: um nome parecido, se houver um só. */
  | { tipo: 'nao_achei'; sugestao: string | null }
  /** O começo do nome serve para mais de um. */
  | { tipo: 'varios'; opcoes: string[] }
);
export type TimeNaPrevia = { nomes: NomeNaPrevia[]; completes: number[] };
/** `pronto`: todo nome achou um jogador e ninguém aparece duas vezes (só assim dá para salvar). `ignoradas`: linhas que não viraram nada. */
export type Previa = { times: TimeNaPrevia[]; pronto: boolean; ignoradas: string[] };

/** Os times colados com cada nome casado a um jogador ativo, pelas mesmas regras do robô (nome inteiro ou começo). */
export function previaDosTimes(texto: string, ativos: JogadorNota[]): { ok: true; previa: Previa } | { ok: false; erro: string } {
  const lidos = lerTimesColados(texto);
  if (!lidos.ok) return lidos;
  const casados = lidos.times.map((t) => ({
    completes: t.completes,
    nomes: t.nomes.map(({ nome, linha }): NomeNaPrevia => {
      const achado = acharJogador(nome, ativos);
      if (!achado) return { escrito: nome, linha, tipo: 'nao_achei', sugestao: sugerirNome(nome, ativos)?.nome ?? null };
      if ('varios' in achado) return { escrito: nome, linha, tipo: 'varios', opcoes: achado.varios.map((j) => j.nome) };
      const { id, nome: cadastrado, nota } = achado.jogador;
      return { escrito: nome, linha, tipo: 'ok', jogador: { id, nome: cadastrado, nota }, repetido: false };
    }),
  }));
  const vezes = new Map<number, number>();
  for (const n of casados.flatMap((t) => t.nomes)) if (n.tipo === 'ok') vezes.set(n.jogador.id, (vezes.get(n.jogador.id) ?? 0) + 1);
  for (const n of casados.flatMap((t) => t.nomes)) if (n.tipo === 'ok') n.repetido = vezes.get(n.jogador.id)! > 1;
  const pronto = casados.every((t) => t.nomes.every((n) => n.tipo === 'ok' && !n.repetido));
  return { ok: true, previa: { times: casados, pronto, ignoradas: lidos.ignoradas } };
}

/** Os ids por time (na ordem das cores) e as notas dos COMPLETE, como o `salvarTimesDefinitivos` recebe. */
export function elencosDaPrevia(previa: Previa): { elencos: number[][]; completes: number[][] } {
  return {
    elencos: previa.times.map((t) => t.nomes.flatMap((n) => (n.tipo === 'ok' ? [n.jogador.id] : []))),
    completes: previa.times.map((t) => t.completes),
  };
}
