export type JogadorNota = { id: number; nome: string; nota: number }
export type TimeSorteado = { jogadores: JogadorNota[]; soma: number }

type Opcoes = { times?: number; tentativas?: number; rng?: () => number }

const EPS = 1e-9
const TOLERANCIA_SOMA = 0.5

const somar = (js: JogadorNota[]) => js.reduce((s, j) => s + j.nota, 0)

function montar(js: JogadorNota[]): TimeSorteado {
  const jogadores = [...js].sort((a, b) => b.nota - a.nota || a.nome.localeCompare(b.nome))
  return { jogadores, soma: somar(jogadores) }
}

const media = (t: TimeSorteado) => (t.jogadores.length ? t.soma / t.jogadores.length : 0)

/** Maior soma − menor soma. */
export function diferenca(times: TimeSorteado[]): number {
  if (!times.length) return 0
  const somas = times.map((t) => t.soma)
  return Math.max(...somas) - Math.min(...somas)
}

/** Maior média − menor média (justo quando os times têm tamanhos diferentes). */
export function diferencaMedia(times: TimeSorteado[]): number {
  const medias = times.filter((t) => t.jogadores.length > 0).map(media)
  if (!medias.length) return 0
  return Math.max(...medias) - Math.min(...medias)
}

/**
 * Sorteia times equilibrados por nota.
 * Custo = diferença entre a maior e a menor MÉDIA (com 4,3,3,3 a soma seria injusta).
 * A tolerância "melhor custo + 0,5" vale 0,5 em soma para times do mesmo tamanho;
 * na escala da média isso é 0,5 / tamanho do maior time (0,125 com 4 por time).
 * Desempate: entre as divisões dentro da tolerância, ficam só as de menor
 * "concentração" (maior variância interna de um time), o que espalha os
 * craques e os fracos em vez de juntar dois 5 num time que empata na soma.
 * O rng sorteia entre as restantes.
 */
export function sortearTimes(jogadores: JogadorNota[], opts: Opcoes = {}): TimeSorteado[] {
  const { times: nTimes = 4, tentativas = 3000, rng = Math.random } = opts
  const n = jogadores.length
  const base = Math.floor(n / nTimes)
  const resto = n % nTimes
  const tamanhos = Array.from({ length: nTimes }, (_, i) => base + (i < resto ? 1 : 0))
  if (n === 0) return tamanhos.map(() => montar([]))

  const tolerancia = TOLERANCIA_SOMA / Math.max(1, tamanhos[0])
  const mediaGlobal = somar(jogadores) / n
  const candidatos: { custo: number; conc: number; times: JogadorNota[][] }[] = []
  let melhor = Infinity

  for (let k = 0; k < Math.max(1, tentativas); k++) {
    const emb = [...jogadores]
    for (let i = emb.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[emb[i], emb[j]] = [emb[j], emb[i]]
    }
    const grupos: JogadorNota[][] = []
    let pos = 0
    for (const t of tamanhos) {
      grupos.push(emb.slice(pos, pos + t))
      pos += t
    }
    const medias = grupos.filter((g) => g.length).map((g) => somar(g) / g.length)
    const custo = Math.max(...medias) - Math.min(...medias)
    if (custo > melhor + tolerancia + EPS) continue
    melhor = Math.min(melhor, custo)
    const conc = Math.max(
      ...grupos.filter((g) => g.length).map((g) => g.reduce((s, x) => s + (x.nota - mediaGlobal) ** 2, 0) / g.length),
    )
    candidatos.push({ custo, conc, times: grupos })
  }

  const dentro = candidatos.filter((c) => c.custo <= melhor + tolerancia + EPS)
  const menorConc = Math.min(...dentro.map((c) => c.conc))
  const finais = dentro.filter((c) => c.conc <= menorConc + EPS)
  const escolhido = finais[Math.min(finais.length - 1, Math.floor(rng() * finais.length))]
  return escolhido.times.map(montar)
}
