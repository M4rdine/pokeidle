import { describe, expect, it } from 'vitest'
import { ItemListSchema, LootListSchema, MoveSchema, SpeciesSchema, TYPE_NAMES, TypeChartSchema, parseHuntMap } from '../src/index.js'
import { parseOrThrow } from '../src/parse-or-throw.js'

const charmander = {
  id: 4, name: 'charmander', types: ['fire'],
  baseStats: { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 },
  baseExperience: 62, growthRate: 'medium-slow', captureRate: 45,
  learnset: [{ move: 'scratch', level: 1 }, { move: 'ember', level: 1 }],
  evolvesTo: { species: 'charmeleon', level: 16 },
}

describe('SpeciesSchema', () => {
  it('aceita uma ficha válida com e sem evolução', () => {
    expect(SpeciesSchema.parse(charmander).name).toBe('charmander')
    const { evolvesTo: _omit, ...noEvo } = charmander
    expect(SpeciesSchema.parse(noEvo).evolvesTo).toBeUndefined()
  })
  it('rejeita growthRate fora das quatro curvas da Gen 1', () => {
    expect(() => SpeciesSchema.parse({ ...charmander, growthRate: 'erratic' })).toThrow()
  })
  it('rejeita tipo desconhecido, nome fora de kebab-case e mais de dois tipos', () => {
    expect(() => SpeciesSchema.parse({ ...charmander, types: ['lava'] })).toThrow()
    expect(() => SpeciesSchema.parse({ ...charmander, name: 'Charmander' })).toThrow()
    expect(() => SpeciesSchema.parse({ ...charmander, types: ['fire', 'flying', 'dragon'] })).toThrow()
  })
  it('rejeita captureRate fora de 1..255, evolvesTo.level < 2 e baseStats.hp < 1', () => {
    expect(() => SpeciesSchema.parse({ ...charmander, captureRate: 0 })).toThrow()
    expect(() => SpeciesSchema.parse({ ...charmander, captureRate: 256 })).toThrow()
    expect(() => SpeciesSchema.parse({ ...charmander, evolvesTo: { species: 'x', level: 1 } })).toThrow()
    expect(() => SpeciesSchema.parse({ ...charmander, baseStats: { ...charmander.baseStats, hp: 0 } })).toThrow()
  })
})

describe('MoveSchema', () => {
  it('exige power >= 1 e aceita accuracy null', () => {
    expect(MoveSchema.parse({ name: 'swift', type: 'normal', power: 60, accuracy: null, damageClass: 'physical' }).accuracy).toBeNull()
    expect(() => MoveSchema.parse({ name: 'growl', type: 'normal', power: 0, accuracy: 100, damageClass: 'status' })).toThrow()
  })
})

describe('TypeChartSchema', () => {
  const full = Object.fromEntries(TYPE_NAMES.map((a) => [a, Object.fromEntries(TYPE_NAMES.map((d) => [d, 1]))]))
  it('aceita 18x18 completo e rejeita coluna faltando ou multiplicador estranho', () => {
    expect(TypeChartSchema.parse(full).fire.grass).toBe(1)
    const { fairy: _drop, ...missing } = full
    expect(() => TypeChartSchema.parse(missing)).toThrow()
    expect(() => TypeChartSchema.parse({ ...full, fire: { ...full.fire, grass: 3 } })).toThrow()
  })
})

describe('itens e loot', () => {
  it('discrimina poção e bola', () => {
    const items = ItemListSchema.parse([
      { id: 'potion', name: 'Poção', kind: 'potion', healPercent: 20, buyPrice: 100, sellPrice: 50 },
      { id: 'poke-ball', name: 'Poké Bola', kind: 'ball', ballBonus: 1, buyPrice: 200, sellPrice: 100 },
    ])
    expect(items[0]?.kind).toBe('potion')
    expect(() => ItemListSchema.parse([{ id: 'x', name: 'x', kind: 'ball', healPercent: 20, buyPrice: 1, sellPrice: 1 }])).toThrow()
  })
  it('loot exige gold min <= max e chance em [0,1]', () => {
    expect(LootListSchema.parse([{ species: 'zubat', gold: [4, 9], drops: [{ item: 'potion', chance: 0.08 }] }])).toHaveLength(1)
    expect(() => LootListSchema.parse([{ species: 'zubat', gold: [9, 4], drops: [] }])).toThrow(/min/)
    expect(() => LootListSchema.parse([{ species: 'zubat', gold: [1, 2], drops: [{ item: 'potion', chance: 1.5 }] }])).toThrow()
  })
  it('rejeita preço negativo, ballBonus <= 0 e species fora de kebab-case', () => {
    expect(() => ItemListSchema.parse([{ id: 'potion', name: 'Poção', kind: 'potion', healPercent: 20, buyPrice: -1, sellPrice: 50 }])).toThrow()
    expect(() => ItemListSchema.parse([{ id: 'poke-ball', name: 'Poké Bola', kind: 'ball', ballBonus: 0, buyPrice: 200, sellPrice: 100 }])).toThrow()
    expect(() => LootListSchema.parse([{ species: 'Zubat', gold: [1, 2], drops: [] }])).toThrow()
  })
})

describe('parseOrThrow e HuntMap', () => {
  it('formata caminho e mensagem, com dica opcional', () => {
    expect(() => parseOrThrow(MoveSchema, { name: 'x' }, 'golpe', 'veja moves.json')).toThrow(/golpe inválido:[\s\S]*type[\s\S]*dica: veja moves.json/)
  })
  it('formata mensagem sem dica quando não informada', () => {
    try {
      parseOrThrow(MoveSchema, { name: 'x' }, 'golpe')
      throw new Error('deveria ter lançado')
    } catch (error) {
      const message = (error as Error).message
      expect(message).toMatch(/golpe inválido:/)
      expect(message).not.toContain('dica:')
    }
  })
  it('parseHuntMap rejeita camada com tamanho errado', () => {
    const map = { id: 'r', name: 'R', width: 2, height: 1, tileSize: 32, layers: { ground: ['grass'], detail: [null, null], blocking: [false, false] }, spawnPoint: { x: 0, y: 0 }, pokecenter: { x: 1, y: 0 }, spawns: [] }
    expect(() => parseHuntMap(map)).toThrow(/width\*height/)
  })

  const validMap = {
    id: 'r', name: 'R', width: 2, height: 1, tileSize: 32,
    layers: { ground: ['grass', 'grass'], detail: [null, null], blocking: [false, false] },
    spawnPoint: { x: 0, y: 0 }, pokecenter: { x: 1, y: 0 }, spawns: [],
  }
  const validSpawn = { speciesName: 'zubat', minLevel: 3, maxLevel: 5, x: 0, y: 0, radius: 0, count: 1, respawnSeconds: 10 }

  it('rejeita spawn com minLevel > maxLevel', () => {
    const map = { ...validMap, spawns: [{ ...validSpawn, minLevel: 5, maxLevel: 3 }] }
    expect(() => parseHuntMap(map)).toThrow(/minLevel/)
  })
  it('rejeita spawn fora do mapa', () => {
    const map = { ...validMap, spawns: [{ ...validSpawn, x: 2 }] }
    expect(() => parseHuntMap(map)).toThrow(/fora do mapa \(2x1\)/)
  })
  it('rejeita pokecenter fora do mapa', () => {
    const map = { ...validMap, pokecenter: { x: 0, y: 1 } }
    expect(() => parseHuntMap(map)).toThrow(/fora do mapa/)
  })
  it('rejeita tileSize diferente de TILE_SIZE', () => {
    const map = { ...validMap, tileSize: 16 }
    expect(() => parseHuntMap(map)).toThrow()
  })
  it('rejeita id fora de kebab-case', () => {
    const map = { ...validMap, id: 'Rota_1' }
    expect(() => parseHuntMap(map)).toThrow()
  })
  it('rejeita spawns vazio', () => {
    expect(() => parseHuntMap(validMap)).toThrow()
  })
})
