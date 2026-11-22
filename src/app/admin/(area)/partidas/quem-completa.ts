// As vagas de COMPLETE de uma partida e quem completa cada uma (só nesta partida). Sem React: a
// tela de partidas usa para montar os passos, a ação `iniciar` para conferir o pedido.

import type { Lado } from '@/domain/partida';
import type { JogadorNota } from '@/domain/sorteio';
import { idValido } from '@/server/erros';

/** Uma vaga de COMPLETE de um dos dois times da partida, com a nota de referência dele. */
export type Vaga = { lado: Lado; nota: number };
/** A escolha de uma vaga: alguém completa, ou o time joga sem. */
export type Resposta = { tipo: 'jogador'; jogador: JogadorNota } | { tipo: 'sem' };
export type Completam = { A: number[]; B: number[] };

/** Um time não tem mais COMPLETE que isso (4 vagas, pelo menos 1 jogador de verdade). */
const MAX_POR_LADO = 4;

/** Uma vaga por COMPLETE: primeiro as do lado A, depois as do B. */
export function vagasDaPartida(a: { completes: { nota: number }[] }, b: { completes: { nota: number }[] }): Vaga[] {
  return [...a.completes.map((c) => ({ lado: 'A' as const, nota: c.nota })), ...b.completes.map((c) => ({ lado: 'B' as const, nota: c.nota }))];
}

/** A próxima vaga sem resposta depois de `atual` (dando a volta); null quando todas têm. */
export function proximaVaga(respostas: (Resposta | undefined)[], atual: number): number | null {
  const n = respostas.length;
  for (let passo = 1; passo <= n; passo++) {
    const i = (((atual + passo) % n) + n) % n;
    if (!respostas[i]) return i;
  }
  return null;
}

/** O pedido para `iniciar`: os ids de quem completa, por lado. "Jogar sem" não entra. */
export function completamDe(vagas: Vaga[], respostas: (Resposta | undefined)[]): Completam {
  const r: Completam = { A: [], B: [] };
  vagas.forEach((v, i) => {
    const resposta = respostas[i];
    if (resposta?.tipo === 'jogador') r[v.lado].push(resposta.jogador.id);
  });
  return r;
}

/** Quem já completa outra vaga desta partida (não pode completar duas). */
export function escolhidosFora(respostas: (Resposta | undefined)[], atual: number): Set<number> {
  return new Set(respostas.flatMap((r, i) => (i !== atual && r?.tipo === 'jogador' ? [r.jogador.id] : [])));
}

const listaDeIds = (v: unknown) => Array.isArray(v) && v.length <= MAX_POR_LADO && v.every(idValido);

/** Formato do pedido vindo do cliente: `{ A: ids, B: ids }`. As regras (quem pode) ficam no servidor. */
export function completamValido(v: unknown): v is Completam {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const { A, B } = v as Record<string, unknown>;
  return listaDeIds(A) && listaDeIds(B);
}
