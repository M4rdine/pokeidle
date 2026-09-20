import { describe, expect, it } from 'vitest'
import { desenharRegiao, GRADE } from '../src/region-draw.js'
import { REGIOES } from '../src/regioes.js'
import type { Bioma, RegionSpec } from '../src/regioes.js'

const todos = (): boolean => true

/** Índices da área do bioma, na grade da região. */
function indicesDaArea(regiao: RegionSpec, id: string): number[] {
  const indice = regiao.biomas.findIndex((b) => b.id === id)
  const porLinha = Math.floor(GRADE.width / GRADE.areaWidth)
  const ax = (indice % porLinha) * GRADE.areaWidth
  const ay = Math.floor(indice / porLinha) * GRADE.areaHeight
  const todosOsIndices: number[] = []
  for (let y = 0; y < GRADE.areaHeight; y++) {
    for (let x = 0; x < GRADE.areaWidth; x++) todosOsIndices.push((ay + y) * GRADE.width + ax + x)
  }
  return todosOsIndices
}

const comMarco = (regiao: RegionSpec): Bioma[] => regiao.biomas.filter((b) => b.marco !== undefined)

describe('marco por área', () => {
  it('toda área que declara marco ganha as nove peças dele', () => {
    for (const regiao of REGIOES) {
      const draft = desenharRegiao(regiao, todos)
      expect(comMarco(regiao).length, `${regiao.id} precisa ter bioma com marco`).toBeGreaterThan(0)
      for (const bioma of comMarco(regiao)) {
        const dentro = indicesDaArea(regiao, bioma.id)
        const pecas = dentro
          .map((i) => draft.canopy[i] ?? draft.detail[i])
          .filter((n): n is string => n?.startsWith(`${bioma.marco!}-`) === true)
        expect(new Set(pecas).size, `${bioma.id}: peças distintas do marco`).toBe(9)
      }
    }
  })

  it('o marco barra passagem e não pisa no Centro', () => {
    for (const regiao of REGIOES) {
      const draft = desenharRegiao(regiao, todos)
      for (const bioma of comMarco(regiao)) {
        for (const i of indicesDaArea(regiao, bioma.id)) {
          const nome = draft.canopy[i] ?? draft.detail[i]
          if (nome?.startsWith(`${bioma.marco!}-`) !== true) continue
          expect(draft.blocked[i], `${bioma.id}: marco tem que barrar`).toBe(true)
          expect(nome.startsWith('centro-pokemon')).toBe(false)
        }
      }
    }
  })

  it('sem o marco no atlas o mapa continua válido, só sem marco', () => {
    const semMarcos = (nome: string): boolean =>
      !['boca-de-caverna', 'naufragio', 'pedras-erguidas'].some((m) => nome.startsWith(m))
    const draft = desenharRegiao(REGIOES[0]!, semMarcos)
    expect(draft.detail.some((n) => n?.startsWith('boca-de-caverna'))).toBe(false)
    // O Centro continua lá: um marco que não existe no atlas não pode derrubar o resto.
    expect(draft.detail.some((n) => n?.startsWith('centro-pokemon'))).toBe(true)
  })
})
