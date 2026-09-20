import { describe, expect, it } from 'vitest'
import { desenharRegiao, GRADE } from '../src/region-draw.js'
import { REGIOES } from '../src/regioes.js'
import type { RegionSpec } from '../src/regioes.js'

const todos = (): boolean => true
/** Um atlas sem o prédio, para provar que o desenho degrada em vez de quebrar. */
const semCentro = (nome: string): boolean => !nome.startsWith('centro-pokemon')

/** A porta de cada Centro, em tiles da grade. */
function portas(regiao: RegionSpec, temTile: (n: string) => boolean = todos): { area: string; x: number; y: number }[] {
  const achadas: { area: string; x: number; y: number }[] = []
  let area = ''
  for (const o of desenharRegiao(regiao, temTile).objetos) {
    if (o.classe === 'area') { area = o.nome; continue }
    if (o.classe !== 'pokecenter') continue
    achadas.push({ area, x: Math.floor(o.x / GRADE.tileSize), y: Math.floor(o.y / GRADE.tileSize) })
  }
  return achadas
}

describe('o Centro Pokémon vira prédio', () => {
  it.each(REGIOES.map((r) => [r.id, r] as const))('em %s toda área ganha o prédio acima da porta', (_id, regiao) => {
    const draft = desenharRegiao(regiao, todos)
    const achadas = portas(regiao)
    expect(achadas).toHaveLength(regiao.biomas.length)
    for (const { area, x, y } of achadas) {
      // O prédio de 3×3 fica com a coluna do meio em cima da porta: quem cura chega por baixo.
      for (let dy = 0; dy < 3; dy++) {
        for (let dx = 0; dx < 3; dx++) {
          const i = (y - 3 + dy) * GRADE.width + (x - 1 + dx)
          const nome = draft.canopy[i] ?? draft.detail[i]
          expect(nome, `${area}: peça (${dx},${dy}) do prédio`).toBe(`centro-pokemon-x${dx}-y${dy}`)
          expect(draft.blocked[i], `${area}: prédio tem que barrar`).toBe(true)
        }
      }
    }
  })

  it('a porta continua pisável: é onde o jogador para para curar', () => {
    const draft = desenharRegiao(REGIOES[0]!, todos)
    for (const { area, x, y } of portas(REGIOES[0]!)) {
      expect(draft.blocked[y * GRADE.width + x], `${area}: porta`).toBe(false)
    }
  })

  it('sem o prédio no atlas o mapa continua válido, só sem prédio', () => {
    const draft = desenharRegiao(REGIOES[0]!, semCentro)
    expect(draft.detail.some((n) => n?.startsWith('centro-pokemon'))).toBe(false)
    expect(draft.canopy.some((n) => n?.startsWith('centro-pokemon'))).toBe(false)
    for (const { x, y } of portas(REGIOES[0]!, semCentro)) {
      expect(draft.blocked[y * GRADE.width + x]).toBe(false)
    }
  })
})
