import { describe, expect, it } from 'vitest'
import { diferenca, diferencaMedia, sortearTimes, type JogadorNota } from '@/domain/sorteio'
import { criarRng } from '../helpers/rng'

function jogadores(notas: number[]): JogadorNota[] {
  return notas.map((nota, i) => ({ id: i + 1, nome: `J${String(i + 1).padStart(2, '0')}`, nota }))
}

const ids = (times: { jogadores: JogadorNota[] }[]) =>
  times.flatMap((t) => t.jogadores.map((j) => j.id)).sort((a, b) => a - b)

describe('sortearTimes', () => {
  it('16 jogadores: 4 times de 4, todos uma vez, diferença <= 1', () => {
    const js = jogadores([5, 4.5, 4, 4, 3.5, 3.5, 3, 3, 3, 2.5, 2.5, 2, 2, 1.5, 1, 0.5])
    const times = sortearTimes(js, { rng: criarRng(1) })
    expect(times.map((t) => t.jogadores.length)).toEqual([4, 4, 4, 4])
    expect(ids(times)).toEqual(js.map((j) => j.id))
    expect(diferenca(times)).toBeLessThanOrEqual(1)
    for (const t of times) {
      expect(t.soma).toBe(t.jogadores.reduce((s, j) => s + j.nota, 0))
    }
  })

  it('nunca junta dois 5 quando dá para separar', () => {
    const js = jogadores([5, 5, 5, 5, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3, 3, 3])
    for (const semente of [1, 2, 3, 4, 5]) {
      const times = sortearTimes(js, { rng: criarRng(semente) })
      for (const t of times) {
        expect(t.jogadores.filter((j) => j.nota === 5)).toHaveLength(1)
      }
    }
  })

  it('13 jogadores: tamanhos 4,3,3,3 e média equilibrada', () => {
    const js = jogadores([5, 4, 4, 3.5, 3, 3, 3, 3, 2.5, 2, 2, 1.5, 1])
    const times = sortearTimes(js, { rng: criarRng(7) })
    expect(times.map((t) => t.jogadores.length)).toEqual([4, 3, 3, 3])
    expect(ids(times)).toEqual(js.map((j) => j.id))
    expect(diferencaMedia(times)).toBeLessThanOrEqual(1)
  })

  it('sementes diferentes dão divisões diferentes quando há muitas equivalentes', () => {
    const js = jogadores(Array(16).fill(3))
    const a = sortearTimes(js, { rng: criarRng(1) })
    const b = sortearTimes(js, { rng: criarRng(2) })
    const chave = (ts: typeof a) => ts.map((t) => t.jogadores.map((j) => j.id).join(',')).join('|')
    expect(chave(a)).not.toBe(chave(b))
  })

  it('é determinístico para a mesma semente', () => {
    const js = jogadores([5, 4, 3, 3, 2, 1, 4, 3, 3, 2, 2, 5, 1, 3, 3, 4])
    expect(sortearTimes(js, { rng: criarRng(9) })).toEqual(sortearTimes(js, { rng: criarRng(9) }))
  })

  it('jogadores dentro do time ficam por nota desc e depois nome', () => {
    const js = jogadores([3, 3, 4, 2, 5, 1, 3, 3])
    const times = sortearTimes(js, { times: 2, rng: criarRng(3) })
    for (const t of times) {
      const ordenado = [...t.jogadores].sort((x, y) => y.nota - x.nota || x.nome.localeCompare(y.nome))
      expect(t.jogadores).toEqual(ordenado)
    }
  })

  it('casos de borda: 0 jogadores e menos jogadores que times', () => {
    expect(sortearTimes([])).toEqual([0, 1, 2, 3].map(() => ({ jogadores: [], soma: 0 })))
    const tres = sortearTimes(jogadores([3, 4, 5]), { rng: criarRng(1) })
    expect(tres.map((t) => t.jogadores.length)).toEqual([1, 1, 1, 0])
    expect(diferencaMedia(tres)).toBeGreaterThanOrEqual(0)
  })

  it('3000 tentativas com 16 jogadores completam', () => {
    const js = jogadores([5, 4.5, 4, 4, 3.5, 3.5, 3, 3, 3, 2.5, 2.5, 2, 2, 1.5, 1, 0.5])
    const times = sortearTimes(js, { tentativas: 3000, rng: criarRng(11) })
    expect(ids(times)).toHaveLength(16)
  })
})

describe('diferenca', () => {
  it('maior soma menos menor soma', () => {
    expect(
      diferenca([
        { jogadores: [], soma: 10 },
        { jogadores: [], soma: 7.5 },
      ]),
    ).toBe(2.5)
  })
})
