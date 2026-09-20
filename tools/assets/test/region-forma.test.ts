import { describe, expect, it } from 'vitest'
import { desenharRegiao, GRADE } from '../src/region-draw.js'
import { regiaoPorId } from '../src/regioes.js'
import type { Bioma, RegionSpec } from '../src/regioes.js'

const todos = (): boolean => true
const kanto = regiaoPorId('kanto')!

/**
 * Substitui um bioma da região real mantendo a posição dele: a semente de cada área vem do
 * índice, então medir o bioma fora do lugar dele mede outro desenho.
 */
const kantoCom = (id: string, campos: Partial<Bioma>): { spec: RegionSpec; bioma: Bioma; indice: number } => {
  const indice = kanto.biomas.findIndex((b) => b.id === id)
  if (indice < 0) throw new Error(`bioma ${id} não existe`)
  const bioma = { ...kanto.biomas[indice]!, ...campos }
  return { spec: { ...kanto, biomas: kanto.biomas.map((b, i) => (i === indice ? bioma : b)) }, bioma, indice }
}

/** Células da área do bioma cujo tile é o material secundário puro do conjunto dele. */
function celulasSecundarias(bioma: Bioma, indice: number, ground: readonly string[]): Set<number> {
  const porLinha = Math.floor(GRADE.width / GRADE.areaWidth)
  const ax = (indice % porLinha) * GRADE.areaWidth
  const ay = Math.floor(indice / porLinha) * GRADE.areaHeight
  const alvo = `${bioma.set}-bbbb`
  const achadas = new Set<number>()
  for (let y = 0; y < GRADE.areaHeight; y++) {
    for (let x = 0; x < GRADE.areaWidth; x++) {
      const i = (ay + y) * GRADE.width + ax + x
      if (ground[i]!.startsWith(alvo)) achadas.add(i)
    }
  }
  return achadas
}

/** Quantos pedaços desconexos as células formam, em vizinhança de 4. */
function componentes(celulas: ReadonlySet<number>): number {
  const restantes = new Set(celulas)
  let n = 0
  while (restantes.size > 0) {
    const [raiz] = restantes
    const fila = [raiz!]
    restantes.delete(raiz!)
    n += 1
    while (fila.length > 0) {
      const i = fila.pop()!
      for (const vizinho of [i - 1, i + 1, i - GRADE.width, i + GRADE.width]) {
        if (!restantes.has(vizinho)) continue
        // Sem esta guarda a vizinhança daria a volta na linha e ligaria bordas opostas.
        if (Math.abs((vizinho % GRADE.width) - (i % GRADE.width)) > 1) continue
        restantes.delete(vizinho)
        fila.push(vizinho)
      }
    }
  }
  return n
}

describe('forma da mancha secundária', () => {
  it('corpo devolve uma massa só, e não um punhado de poças', () => {
    const { spec, bioma, indice } = kantoCom('margem-do-lago', { forma: 'corpo' })
    const celulas = celulasSecundarias(bioma, indice, desenharRegiao(spec, todos).ground)
    expect(celulas.size, 'o lago não pode sumir').toBeGreaterThan(40)
    expect(componentes(celulas)).toBe(1)
  })

  it('ruído continua espalhando: a mudança não pode reescrever os mapas que já estavam bons', () => {
    const { spec, bioma, indice } = kantoCom('trilha-pedregosa', {})
    expect(bioma.forma ?? 'ruido').toBe('ruido')
    const celulas = celulasSecundarias(bioma, indice, desenharRegiao(spec, todos).ground)
    expect(componentes(celulas)).toBeGreaterThan(1)
  })

  it('margem encosta a massa numa borda da área, em vez de abrir uma lagoa no meio', () => {
    const { spec, bioma, indice } = kantoCom('praia-longa', { forma: 'margem' })
    const celulas = celulasSecundarias(bioma, indice, desenharRegiao(spec, todos).ground)
    expect(celulas.size).toBeGreaterThan(40)
    const porLinha = Math.floor(GRADE.width / GRADE.areaWidth)
    const ax = (indice % porLinha) * GRADE.areaWidth
    const ay = Math.floor(indice / porLinha) * GRADE.areaHeight
    const colunas = [...celulas].map((i) => (i % GRADE.width) - ax)
    const linhas = [...celulas].map((i) => Math.floor(i / GRADE.width) - ay)
    // Toca uma das quatro bordas da área: é o que separa mar de lagoa.
    const encosta = Math.min(...colunas) <= 1 || Math.max(...colunas) >= GRADE.areaWidth - 2
      || Math.min(...linhas) <= 1 || Math.max(...linhas) >= GRADE.areaHeight - 2
    expect(encosta).toBe(true)
  })
})
