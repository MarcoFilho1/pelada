export type JogadorNota = { id: number; nome: string; nota: number }

/** Cores dos coletes, na ordem dos times. */
export const CORES = ['azul', 'laranja', 'verde', 'preto'] as const
export type Cor = (typeof CORES)[number]

/** Nota ou soma de notas para a tela: 3.5 → '3,5'. */
export const formatarNota = (n: number) => n.toFixed(1).replace('.', ',')
/** Notas que o sorteio escolhe sozinho para cada COMPLETE (vaga a ser preenchida por alguém presente). */
export const NOTAS_COMPLETE = [2.5, 3, 3.5] as const

/** `completes` são as notas das vagas COMPLETE; `soma` inclui jogadores e completes. */
export type TimeSorteado = { jogadores: JogadorNota[]; completes: number[]; soma: number }

type Opcoes = { times?: number; tentativas?: number; rng?: () => number }
type OpcoesComplete = Opcoes & { porTime?: number }

const EPS = 1e-9
const TOLERANCIA_SOMA = 0.5

const somar = (js: JogadorNota[]) => js.reduce((s, j) => s + j.nota, 0)

function montar(js: JogadorNota[]): TimeSorteado {
  const jogadores = [...js].sort((a, b) => b.nota - a.nota || a.nome.localeCompare(b.nome))
  return { jogadores, completes: [], soma: somar(jogadores) }
}

const tamanho = (t: TimeSorteado) => t.jogadores.length + t.completes.length
const media = (t: TimeSorteado) => (tamanho(t) ? t.soma / tamanho(t) : 0)

/** Maior soma − menor soma. */
export function diferenca(times: TimeSorteado[]): number {
  if (!times.length) return 0
  const somas = times.map((t) => t.soma)
  return Math.max(...somas) - Math.min(...somas)
}

/** Maior média − menor média (justo quando os times têm tamanhos diferentes). */
export function diferencaMedia(times: TimeSorteado[]): number {
  const medias = times.filter((t) => tamanho(t) > 0).map(media)
  if (!medias.length) return 0
  return Math.max(...medias) - Math.min(...medias)
}

/**
 * A manchete de equilíbrio: a diferença das somas quando os times têm o mesmo tamanho; com tamanhos
 * diferentes (a soma seria injusta), a diferença das médias, "por jogador".
 */
export function rotuloDaDiferenca(times: TimeSorteado[]): string {
  const igual = new Set(times.map(tamanho)).size <= 1
  return igual ? `Diferença: ${formatarNota(diferenca(times))}` : `Diferença: ${formatarNota(diferencaMedia(times))} por jogador`
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
  return sortearInterno(jogadores, opts, false)?.times ?? []
}

/** Núcleo do sorteio. Com `exigirReal`, descarta divisões com time sem jogador de verdade (ids > 0). */
function sortearInterno(
  jogadores: JogadorNota[],
  opts: Opcoes,
  exigirReal: boolean,
): { times: TimeSorteado[]; custo: number } | null {
  const { times: pedidos = 4, tentativas = 3000, rng = Math.random } = opts
  const nTimes = Math.max(1, Math.floor(pedidos))
  const n = jogadores.length
  const base = Math.floor(n / nTimes)
  const resto = n % nTimes
  const tamanhos = Array.from({ length: nTimes }, (_, i) => base + (i < resto ? 1 : 0))
  if (n === 0) return { times: tamanhos.map(() => montar([])), custo: 0 }

  const tolerancia = TOLERANCIA_SOMA / Math.max(1, tamanhos[0])
  const reais = exigirReal ? jogadores.filter((j) => j.id > 0) : jogadores
  const corte = [...reais].sort((x, y) => y.nota - x.nota)[Math.min(nTimes, reais.length) - 1].nota
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
    if (exigirReal && grupos.some((g) => !g.some((x) => x.id > 0))) continue
    const medias = grupos.filter((g) => g.length).map((g) => somar(g) / g.length)
    const custo = Math.max(...medias) - Math.min(...medias)
    if (custo > melhor + tolerancia + EPS) continue
    melhor = Math.min(melhor, custo)
    const contagens = grupos.map((g) => g.filter((x) => x.nota >= corte).length)
    const amplitude = Math.max(...contagens) - Math.min(...contagens)
    candidatos.push({ custo, amplitude, times: grupos })
  }

  if (!candidatos.length) return null
  const dentro = candidatos.filter((c) => c.custo <= melhor + tolerancia + EPS)
  const boas = dentro.filter((c) => c.amplitude <= 1)
  const finais = boas.length ? boas : dentro
  const escolhido = finais[Math.min(finais.length - 1, Math.floor(rng() * finais.length))]
  return { times: escolhido.times.map(montar), custo: escolhido.custo }
}

/** Todos os multiconjuntos de `k` notas de COMPLETE (combinações com repetição). */
function combinacoesDeNotas(k: number, de = 0): number[][] {
  if (k === 0) return [[]]
  const out: number[][] = []
  for (let i = de; i < NOTAS_COMPLETE.length; i++) {
    for (const resto of combinacoesDeNotas(k - 1, i)) out.push([NOTAS_COMPLETE[i], ...resto])
  }
  return out
}

/**
 * Sorteia completando times curtos com COMPLETE até `porTime` por time. A nota de cada COMPLETE sai
 * de {2,5; 3; 3,5}: testa cada combinação de notas e fica com a de menor custo (diferença de médias);
 * no empate, a mais perto de 3,0; depois o rng. Todo time tem ao menos um jogador de verdade.
 */
export function sortearComCompletes(jogadores: JogadorNota[], opts: OpcoesComplete = {}): TimeSorteado[] {
  const { times: pedidos = 4, porTime = 4, tentativas = 3000, rng = Math.random } = opts
  const n = jogadores.length
  const nTimes = Math.min(Math.max(1, Math.floor(pedidos)), n)
  const k = Math.max(0, nTimes * porTime - n)
  if (n === 0 || k === 0) return sortearTimes(jogadores, { times: nTimes || pedidos, tentativas, rng })

  const porCombinacao = Math.max(200, Math.floor(tentativas / combinacoesDeNotas(k).length))
  const melhores: { custo: number; desvio: number; notas: number[]; times: TimeSorteado[] }[] = []
  for (const notas of combinacoesDeNotas(k)) {
    const ficticios = notas.map((nota, i) => ({ id: -(i + 1), nome: `COMPLETE ${i + 1}`, nota }))
    const r = sortearInterno([...jogadores, ...ficticios], { times: nTimes, tentativas: porCombinacao, rng }, true)
    if (!r) continue
    melhores.push({ custo: r.custo, desvio: notas.reduce((s, x) => s + Math.abs(x - 3), 0), notas, times: r.times })
  }
  const minCusto = Math.min(...melhores.map((m) => m.custo))
  const empate1 = melhores.filter((m) => m.custo <= minCusto + EPS)
  const minDesvio = Math.min(...empate1.map((m) => m.desvio))
  const finais = empate1.filter((m) => m.desvio <= minDesvio + EPS)
  const escolhido = finais[Math.min(finais.length - 1, Math.floor(rng() * finais.length))]
  return escolhido.times.map((t) => {
    const completes = t.jogadores.filter((j) => j.id < 0).map((j) => j.nota)
    return { jogadores: t.jogadores.filter((j) => j.id > 0), completes, soma: t.soma }
  })
}
