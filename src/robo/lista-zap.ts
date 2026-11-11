// "adicionar", "confirmar" e "remover" pelo WhatsApp: acha o jogador pelo nome e chama as mesmas
// funções dos botões do jogador no site ("Entrar na fila", "Vou", "Não vou"). Nenhuma regra nova aqui.
import type { DB } from '@/db/client';
import { normalizarNome } from '@/domain/nome';
import { mensagemParaUsuario } from '@/server/erros';
import { listarJogadores } from '@/server/jogadores';
import { ErroLista } from '@/server/pelada';
import { confirmar, entrarNaFila, estadoDaSemana, remover, type EstadoDaSemana } from '@/server/presencas';
import type { AcaoNaLista } from './comandos';
import { juntarNomes } from './foto';
import { paraWhatsApp } from './sorteio-zap';

/** `mudou`: a lista mudou (a resposta ganha o "pedido por"). */
export type ResultadoNaLista = { texto: string; mudou: boolean };

// Apelido carinhoso do Jonas no grupo ("calvinho"): brincadeira, não ofensa. Vale pelo jogador achado.
const ehJonas = (nome: string) => normalizarNome(nome) === 'jonas';
const sortear = (variantes: string[], rng: () => number) => variantes[Math.floor(rng() * variantes.length)];
export const CALVINHO = {
  confirmado: [
    '✅ Clarinho que sim! Meu calvinho favorito tá confirmado 😎',
    '✅ Confirmado! A careca mais brilhante da pelada tá garantida ✨',
    '✅ Jonas confirmado! Já pode passar o protetor solar na cabeça ☀️',
    '✅ Calvinho confirmado! Os refletores agradecem a ajuda 💡',
  ],
  jaConfirmado: ['👍 Calma, calvinho, você já tá confirmado 😂', '👍 Já tá confirmado, careca! Relaxa que a vaga é sua 😎'],
  entrouNaLista: [
    '✅ Olha ele! Meu calvinho favorito entrou na lista 😎',
    '✅ Jonas na lista! Separem os óculos escuros, a careca chegou ✨',
    '✅ Entrou o calvinho! A quadra vai ficar mais iluminada hoje 💡',
  ],
  entrouNaFila: ['📝 Calvinho na fila ({n}º)… aguenta firme, careca 🙏', '📝 Jonas na fila ({n}º). Torcendo pra abrir vaga pro meu calvinho favorito 🤞'],
  jaNaLista: ['👍 Jonas já tá na lista, careca apressada 😂'],
  jaNaFila: ['👍 Jonas já tá na fila, calvinho. Paciência 😂'],
  saiu: [
    '👋 Que pena, meu calvinho favorito não vai conseguir ir 😢',
    '👋 Jonas saiu… a quadra vai ficar menos iluminada hoje 💡',
    '👋 Sem o calvinho hoje? Os refletores vão ter que trabalhar dobrado 🔦',
  ],
  foraDaLista: ['🤔 Jonas não tá na lista… cadê o meu calvinho?'],
};

const MIN_COMECO = 2;
const MAX_ECO = 30;

/**
 * Nome escrito → jogador, sem diferenciar maiúsculas e acentos: um só nome inteiro igual vence (dois
 * iguais, como João e Joao, são ambíguos); senão, com 2 letras ou mais, o único que começa com o texto;
 * mais de um → todos (`varios`); nenhum → `null`.
 */
export function acharJogador<T extends { nome: string }>(texto: string, candidatos: T[]): { jogador: T } | { varios: T[] } | null {
  const alvo = normalizarNome(texto);
  if (!alvo) return null;
  const iguais = candidatos.filter((c) => normalizarNome(c.nome) === alvo);
  if (iguais.length === 1) return { jogador: iguais[0] };
  if (iguais.length > 1) return { varios: iguais };
  // Começo do nome só com 2 letras ou mais ("p" acharia gente demais por engano).
  if (alvo.length < MIN_COMECO) return null;
  const comecam = candidatos.filter((c) => normalizarNome(c.nome).startsWith(alvo));
  if (comecam.length === 1) return { jogador: comecam[0] };
  return comecam.length ? { varios: comecam } : null;
}


/** O que a pessoa digitou, para repetir no grupo: no máximo 30 caracteres. */
const eco = (texto: string) => (texto.length > MAX_ECO ? `${texto.slice(0, MAX_ECO)}…` : texto);

const textoVarios = (js: { nome: string }[]) => `🤔 Tem mais de um jogador com esse nome: ${juntarNomes(js.map((j) => j.nome))}. Mande o nome inteiro.`;

/** Recusa do site em texto de WhatsApp (sem "Recarregue a página."). */
const recusa = (e: unknown): ResultadoNaLista => ({ texto: paraWhatsApp(mensagemParaUsuario(e)), mudou: false });

function onde(estado: EstadoDaSemana, jogadorId: number): { lugar: 'lista' | 'fila'; posicao: number; confirmado: boolean } | null {
  const i = estado.principal.findIndex((x) => x.jogadorId === jogadorId);
  if (i >= 0) return { lugar: 'lista', posicao: i + 1, confirmado: estado.principal[i].confirmado };
  const f = estado.fila.findIndex((x) => x.jogadorId === jogadorId);
  return f >= 0 ? { lugar: 'fila', posicao: f + 1, confirmado: false } : null;
}

async function adicionar(db: DB, texto: string, now: Date, rng: () => number): Promise<ResultadoNaLista> {
  const achado = acharJogador(texto, await listarJogadores(db, { incluirInativos: false }));
  if (!achado) return { texto: `🤔 ${eco(texto)} não está cadastrado. Peça para um admin cadastrar no site.`, mudou: false };
  if ('varios' in achado) return { texto: textoVarios(achado.varios), mudou: false };
  const j = achado.jogador;
  try {
    await entrarNaFila(db, j.id, now);
  } catch (e) {
    if (e instanceof ErroLista && e.motivo === 'ja_na_lista') {
      const ja = onde(await estadoDaSemana(db, now), j.id);
      const fila = ja?.lugar === 'fila';
      const normal = `👍 ${j.nome} já está na ${fila ? 'fila' : 'lista'}.`;
      return { texto: ehJonas(j.nome) ? sortear(fila ? CALVINHO.jaNaFila : CALVINHO.jaNaLista, rng) : normal, mudou: false };
    }
    return recusa(e);
  }
  const agora = onde(await estadoDaSemana(db, now), j.id);
  const jonas = ehJonas(j.nome);
  if (agora?.lugar === 'fila') {
    const texto = jonas ? sortear(CALVINHO.entrouNaFila, rng).replace('{n}', String(agora.posicao)) : `📝 ${j.nome} entrou na fila (${agora.posicao}º).`;
    return { texto, mudou: true };
  }
  return { texto: jonas ? sortear(CALVINHO.entrouNaLista, rng) : `✅ ${j.nome} entrou na lista!`, mudou: true };
}

async function confirmarOuRemover(db: DB, acao: 'confirmar' | 'remover', texto: string, now: Date, rng: () => number): Promise<ResultadoNaLista> {
  // O caminho normal da semana, como o site: depois da abertura de segunda, cria a pelada se preciso.
  const estado = await estadoDaSemana(db, now);
  // Para confirmar, quem perdeu o prazo das 14h também é achado: o site recusa com a mensagem dele.
  const candidatos = [...estado.principal, ...estado.fila, ...(acao === 'confirmar' ? estado.foraDoPrazo : [])];
  const achado = acharJogador(texto, candidatos);
  if (!achado) {
    // O Jonas fora da lista também ganha a brincadeira: ele é achado entre todos os cadastrados.
    const todos = acharJogador(texto, await listarJogadores(db, { incluirInativos: false }));
    if (todos && 'jogador' in todos && ehJonas(todos.jogador.nome)) return { texto: sortear(CALVINHO.foraDaLista, rng), mudou: false };
    return { texto: `🤔 ${eco(texto)} não está na lista.`, mudou: false };
  }
  if ('varios' in achado) return { texto: textoVarios(achado.varios), mudou: false };
  const j = achado.jogador;
  const jonas = ehJonas(j.nome);
  const antes = onde(estado, j.jogadorId);
  try {
    if (acao === 'confirmar') {
      if (antes?.lugar === 'lista' && antes.confirmado) return { texto: jonas ? sortear(CALVINHO.jaConfirmado, rng) : `👍 ${j.nome} já estava confirmado.`, mudou: false };
      await confirmar(db, j.jogadorId, now);
      return { texto: jonas ? sortear(CALVINHO.confirmado, rng) : `✅ ${j.nome} confirmado!`, mudou: true };
    }
    await remover(db, j.jogadorId, now);
    return { texto: jonas ? sortear(CALVINHO.saiu, rng) : `👋 ${j.nome} saiu da ${antes?.lugar === 'fila' ? 'fila' : 'lista'}.`, mudou: true };
  } catch (e) {
    return recusa(e);
  }
}

/** Uma ação na lista pedida pelo WhatsApp, com as regras do jogador no site. */
export async function mexerNaLista(db: DB, acao: AcaoNaLista, texto: string, now: Date, rng: () => number = Math.random): Promise<ResultadoNaLista> {
  return acao === 'adicionar' ? adicionar(db, texto, now, rng) : confirmarOuRemover(db, acao, texto, now, rng);
}
