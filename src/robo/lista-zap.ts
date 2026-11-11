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

/**
 * Nome escrito → jogador, sem diferenciar maiúsculas e acentos: nome inteiro igual vence; senão o único
 * que começa com o texto; mais de um → todos (`varios`); nenhum → `null`.
 */
export function acharJogador<T extends { nome: string }>(texto: string, candidatos: T[]): { jogador: T } | { varios: T[] } | null {
  const alvo = normalizarNome(texto);
  if (!alvo) return null;
  const igual = candidatos.find((c) => normalizarNome(c.nome) === alvo);
  if (igual) return { jogador: igual };
  const comecam = candidatos.filter((c) => normalizarNome(c.nome).startsWith(alvo));
  if (comecam.length === 1) return { jogador: comecam[0] };
  return comecam.length ? { varios: comecam } : null;
}

const textoVarios = (js: { nome: string }[]) => `Tem mais de um jogador com esse nome: ${juntarNomes(js.map((j) => j.nome))}. Mande o nome inteiro.`;

/** Recusa do site em texto de WhatsApp (sem "Recarregue a página."). */
const recusa = (e: unknown): ResultadoNaLista => ({ texto: paraWhatsApp(mensagemParaUsuario(e)), mudou: false });

function onde(estado: EstadoDaSemana, jogadorId: number): { lugar: 'lista' | 'fila'; posicao: number; confirmado: boolean } | null {
  const i = estado.principal.findIndex((x) => x.jogadorId === jogadorId);
  if (i >= 0) return { lugar: 'lista', posicao: i + 1, confirmado: estado.principal[i].confirmado };
  const f = estado.fila.findIndex((x) => x.jogadorId === jogadorId);
  return f >= 0 ? { lugar: 'fila', posicao: f + 1, confirmado: false } : null;
}

async function adicionar(db: DB, texto: string, now: Date): Promise<ResultadoNaLista> {
  const achado = acharJogador(texto, await listarJogadores(db, { incluirInativos: false }));
  if (!achado) return { texto: `${texto} não está cadastrado. Peça para um admin cadastrar no site.`, mudou: false };
  if ('varios' in achado) return { texto: textoVarios(achado.varios), mudou: false };
  const j = achado.jogador;
  try {
    await entrarNaFila(db, j.id, now);
  } catch (e) {
    if (e instanceof ErroLista && e.motivo === 'ja_na_lista') {
      const ja = onde(await estadoDaSemana(db, now), j.id);
      return { texto: `${j.nome} já está na ${ja?.lugar === 'fila' ? 'fila' : 'lista'}.`, mudou: false };
    }
    return recusa(e);
  }
  const agora = onde(await estadoDaSemana(db, now), j.id);
  if (agora?.lugar === 'fila') return { texto: `${j.nome} entrou na fila (${agora.posicao}º).`, mudou: true };
  return { texto: `${j.nome} entrou na lista.`, mudou: true };
}

async function confirmarOuRemover(db: DB, acao: 'confirmar' | 'remover', texto: string, now: Date): Promise<ResultadoNaLista> {
  // O caminho normal da semana, como o site: depois da abertura de segunda, cria a pelada se preciso.
  const estado = await estadoDaSemana(db, now);
  // Para confirmar, quem perdeu o prazo das 14h também é achado: o site recusa com a mensagem dele.
  const candidatos = [...estado.principal, ...estado.fila, ...(acao === 'confirmar' ? estado.foraDoPrazo : [])];
  const achado = acharJogador(texto, candidatos);
  if (!achado) return { texto: `${texto} não está na lista.`, mudou: false };
  if ('varios' in achado) return { texto: textoVarios(achado.varios), mudou: false };
  const j = achado.jogador;
  const antes = onde(estado, j.jogadorId);
  try {
    if (acao === 'confirmar') {
      if (antes?.lugar === 'lista' && antes.confirmado) return { texto: `${j.nome} já estava confirmado.`, mudou: false };
      await confirmar(db, j.jogadorId, now);
      return { texto: `${j.nome} confirmado.`, mudou: true };
    }
    await remover(db, j.jogadorId, now);
    return { texto: `${j.nome} saiu da ${antes?.lugar === 'fila' ? 'fila' : 'lista'}.`, mudou: true };
  } catch (e) {
    return recusa(e);
  }
}

/** Uma ação na lista pedida pelo WhatsApp, com as regras do jogador no site. */
export async function mexerNaLista(db: DB, acao: AcaoNaLista, texto: string, now: Date): Promise<ResultadoNaLista> {
  return acao === 'adicionar' ? adicionar(db, texto, now) : confirmarOuRemover(db, acao, texto, now);
}
