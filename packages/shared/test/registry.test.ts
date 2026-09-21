import { describe, expect, it } from 'vitest'
import { TYPE_NAMES } from '../src/index.js'
import { buildRegistry } from '../src/registry.js'
import { loadRegistry } from '../src/registry-full.js'

const minimal = () => ({
  species: [
    { id: 4, name: 'charmander', types: ['fire'], baseStats: { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 }, baseExperience: 62, growthRate: 'medium-slow', captureRate: 45, learnset: [{ move: 'ember', level: 1 }], evolvesTo: { species: 'charmeleon', level: 16 } },
    { id: 5, name: 'charmeleon', types: ['fire'], baseStats: { hp: 58, attack: 64, defense: 58, spAttack: 80, spDefense: 65, speed: 80 }, baseExperience: 142, growthRate: 'medium-slow', captureRate: 45, learnset: [{ move: 'ember', level: 1 }] },
  ],
  moves: [{ name: 'ember', type: 'fire', power: 40, accuracy: 100, damageClass: 'special' }],
  typeChart: Object.fromEntries(TYPE_NAMES.map((a) => [a, Object.fromEntries(TYPE_NAMES.map((d) => [d, 1]))])),
  items: [{ id: 'potion', name: 'Poção', kind: 'potion', healPercent: 20, buyPrice: 100, sellPrice: 50 }],
  loot: [{ species: 'charmander', gold: [1, 2], drops: [{ item: 'potion', chance: 0.5 }] }],
  unlocks: { growthRate: 'medium-fast', teamSlots: [{ level: 1, slots: 3 }], items: {}, regions: {} },
  regions: [{ id: 'kanto', name: 'Kanto', order: 1, minTrainerLevel: 1, width: 1, height: 2, townMap: 'kanto', areas: [{ id: 'r', name: 'R', bounds: { x: 0, y: 0, width: 1, height: 2 }, anchor: { x: 0, y: 1 }, noMapa: { x: 20, y: 30, local: 'Rota 1' }, species: ['charmander'], minLevel: 1, maxLevel: 3, wildCount: 3, respawnSeconds: 20, minTrainerLevel: 1, rarity: 1 }] }],
  hunts: [{ id: 'r', name: 'R', width: 1, height: 2, tileSize: 32, layers: { ground: ['grass', 'grass'], detail: [null, null], blocking: [false, false] }, spawnPoint: { x: 0, y: 0 }, pokecenter: { x: 0, y: 1 }, spawns: [{ speciesName: 'charmander', minLevel: 1, maxLevel: 3, x: 0, y: 0, radius: 0, count: 1, respawnSeconds: 10 }] }],
})

describe('buildRegistry', () => {
  it('indexa por nome e id', () => {
    const r = buildRegistry(minimal())
    expect(r.species.get('charmander')?.id).toBe(4)
    expect(r.speciesById.get(5)?.name).toBe('charmeleon')
    expect(r.moves.get('ember')?.power).toBe(40)
    expect(r.hunts.get('r')?.spawns).toHaveLength(1)
    expect(r.typeChart.fire.fire).toBe(1)
  })
  it('lista todas as referências quebradas de uma vez', () => {
    const raw = minimal()
    raw.species[0]!.learnset = [{ move: 'fire-blast', level: 1 }]
    raw.species[0]!.evolvesTo = { species: 'charizard', level: 36 }
    raw.loot[0]!.drops = [{ item: 'master-ball', chance: 1 }]
    raw.hunts[0]!.spawns[0]!.speciesName = 'mewtwo'
    raw.unlocks = { ...raw.unlocks, items: { 'master-ball': 5 } }
    // Todos os problemas de uma vez, não o primeiro: quem corrige o conteúdo quer a lista
    // inteira. A ordem do relatório não faz parte do contrato.
    const erro = (() => { try { buildRegistry(raw); return '' } catch (e) { return e instanceof Error ? e.message : String(e) } })()
    expect(erro).toMatch(/^registro inconsistente:/)
    for (const trecho of ['fire-blast', 'charizard', 'loot de charmander: item master-ball', 'unlocks: item master-ball', 'mewtwo']) {
      expect(erro, trecho).toContain(trecho)
    }
  })
  it('rejeita id ou nome de espécie duplicado', () => {
    const raw = minimal()
    raw.species[1] = { ...raw.species[1]!, id: 4 }
    expect(() => buildRegistry(raw)).toThrow(/duplicad/)
  })
})

describe('loadRegistry (dados reais do repositório)', () => {
  const r = loadRegistry()
  it('carrega as 42 espécies do manifest com golpes e evoluções coerentes', () => {
    expect(r.species.size).toBe(42)
    expect(r.species.get('charmander')?.evolvesTo).toEqual({ species: 'charmeleon', level: 16 })
    expect(r.species.get('charizard')?.baseStats.hp).toBe(78)
    for (const s of r.species.values()) expect(s.learnset.length).toBeGreaterThanOrEqual(1)
  })
  it('tem Kanto com as oito áreas, cada uma com mapa próprio, e a tabela de tipos completa', () => {
    const kanto = r.regions.get('kanto')!
    expect(kanto.areas).toHaveLength(8)
    expect(kanto.areas.map((a) => a.id)).toContain('campo-inicial')
    // Toda área declarada precisa ter mapa: é o que o registro checa e o que quebra o jogo se faltar.
    for (const area of kanto.areas) expect(r.hunts.get(area.id)?.width).toBe(24)
    expect(r.typeChart.fire.grass).toBe(2)
    expect(r.typeChart.electric.ground).toBe(0)
  })
  it('é memoizado', () => {
    expect(loadRegistry()).toBe(r)
  })
})
