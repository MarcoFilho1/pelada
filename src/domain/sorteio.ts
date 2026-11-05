export type JogadorNota = { id: number; nome: string; nota: number }

/** Cores dos coletes, na ordem dos times. */
export const CORES = ['azul', 'laranja', 'verde', 'preto'] as const
export type Cor = (typeof CORES)[number]

/** Nota ou soma de notas para a tela: 3.5 → '3,5'. */
export const formatarNota = (n: number) => n.toFixed(1).replace('.', ',')
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
 * Preferência estrutural ("cabeças de chave"): T = nota do n-ésimo melhor jogador
 * (n = número de times). Entre as divisões dentro da tolerância, preferem-se as
 * em que a contagem de jogadores com nota >= T varia no máximo 1 entre times
 * (não junta dois craques num time e deixa outro sem). Se nenhuma serve, vale
 * qualquer uma dentro da tolerância. O rng sorteia uniformemente no conjunto.
 */
export function sortearTimes(jogadores: JogadorNota[], opts: Opcoes = {}): TimeSorteado[] {
  const { times: pedidos = 4, tentativas = 3000, rng = Math.random } = opts
  const nTimes = Math.max(1, Math.floor(pedidos))
  const n = jogadores.length
  const base = Math.floor(n / nTimes)
  const resto = n % nTimes
  const tamanhos = Array.from({ length: nTimes }, (_, i) => base + (i < resto ? 1 : 0))
  if (n === 0) return tamanhos.map(() => montar([]))

  const tolerancia = TOLERANCIA_SOMA / Math.max(1, tamanhos[0])
  const corte = [...jogadores].sort((x, y) => y.nota - x.nota)[Math.min(nTimes, n) - 1].nota
  const candidatos: { custo: number; amplitude: number; times: JogadorNota[][] }[] = []
  let melhor = Infinity

  for (let k = 0; k < Math.max(1, tentativas); k++) {
    const emb = [...jogadores]
    for (let i = emb.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(rng() * (i + 1)))
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
    const contagens = grupos.map((g) => g.filter((x) => x.nota >= corte).length)
    const amplitude = Math.max(...contagens) - Math.min(...contagens)
    candidatos.push({ custo, amplitude, times: grupos })
  }

  const dentro = candidatos.filter((c) => c.custo <= melhor + tolerancia + EPS)
  const boas = dentro.filter((c) => c.amplitude <= 1)
  const finais = boas.length ? boas : dentro
  const escolhido = finais[Math.min(finais.length - 1, Math.floor(rng() * finais.length))]
  return escolhido.times.map(montar)
}
