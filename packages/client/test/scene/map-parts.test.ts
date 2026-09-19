import { describe, expect, it } from 'vitest'
import { splitLayer } from '../../src/scene/map-parts.js'

const animations = { water: ['water', 'water_1', 'water_2'] }

describe('splitLayer', () => {
  it('manda para o balde animado só o tile com animação, com a posição em tiles', () => {
    const parts = splitLayer(['grass', 'water', 'grass', 'water'], 2, animations)
    expect(parts.animated).toEqual([
      { name: 'water', col: 1, row: 0 },
      { name: 'water', col: 1, row: 1 },
    ])
    expect(parts.baked).toEqual([
      { name: 'grass', col: 0, row: 0 },
      { name: 'grass', col: 0, row: 1 },
    ])
  })

  it('ignora posição vazia', () => {
    const parts = splitLayer([null, 'grass'], 2, animations)
    expect(parts.animated).toEqual([])
    expect(parts.baked).toEqual([{ name: 'grass', col: 1, row: 0 }])
  })

  it('um tile nunca cai nos dois baldes', () => {
    const parts = splitLayer(['water', 'grass'], 2, animations)
    const positions = [...parts.baked, ...parts.animated].map((p) => `${p.col},${p.row}`)
    expect(new Set(positions).size).toBe(positions.length)
  })

  it('animação de um quadro só continua sendo assada, porque não há o que animar', () => {
    const parts = splitLayer(['water'], 1, { water: ['water'] })
    expect(parts.animated).toEqual([])
    expect(parts.baked).toEqual([{ name: 'water', col: 0, row: 0 }])
  })

  it('camada ausente devolve os dois baldes vazios', () => {
    expect(splitLayer([], 10, animations)).toEqual({ baked: [], animated: [] })
  })
})
