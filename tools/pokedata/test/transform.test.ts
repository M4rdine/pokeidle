import { describe, expect, it } from 'vitest'
import { TYPE_NAMES } from '@pokeidle/shared'
import { toMove, toSpecies, toTypeChart, type PokeApiChain, type PokeApiMove, type PokeApiPokemon, type PokeApiSpecies, type PokeApiType } from '../src/transform.js'

const vg = (level: number, method = 'level-up', group = 'firered-leafgreen') => ({ level_learned_at: level, move_learn_method: { name: method }, version_group: { name: group } })

const pokemon: PokeApiPokemon = {
  id: 4, name: 'charmander', base_experience: 62,
  types: [{ slot: 1, type: { name: 'fire' } }],
  stats: [
    { base_stat: 39, stat: { name: 'hp' } }, { base_stat: 52, stat: { name: 'attack' } }, { base_stat: 43, stat: { name: 'defense' } },
    { base_stat: 60, stat: { name: 'special-attack' } }, { base_stat: 50, stat: { name: 'special-defense' } }, { base_stat: 65, stat: { name: 'speed' } },
  ],
  moves: [
    { move: { name: 'flamethrower' }, version_group_details: [vg(34), vg(1, 'machine')] },
    { move: { name: 'ember' }, version_group_details: [vg(1)] },
    { move: { name: 'growl' }, version_group_details: [vg(1)] },
    { move: { name: 'dragon-claw' }, version_group_details: [vg(1, 'machine'), vg(40, 'level-up', 'sword-shield')] },
  ],
}
const species: PokeApiSpecies = { name: 'charmander', capture_rate: 45, growth_rate: { name: 'medium-slow' }, evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/2/' } }
const chain: PokeApiChain = { chain: { species: { name: 'charmander' }, evolution_details: [], evolves_to: [
  { species: { name: 'charmeleon' }, evolution_details: [{ trigger: { name: 'level-up' }, min_level: 16 }], evolves_to: [
    { species: { name: 'charizard' }, evolution_details: [{ trigger: { name: 'level-up' }, min_level: 36 }], evolves_to: [] } ] } ] } }

describe('toSpecies', () => {
  it('mapeia stats, tipos, learnset FRLG level-up e evolução por nível', () => {
    const warnings: string[] = []
    const s = toSpecies(pokemon, species, chain, new Set(['charmander', 'charmeleon']), (m) => warnings.push(m))
    expect(s.baseStats).toEqual({ hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 })
    expect(s.types).toEqual(['fire'])
    expect(s.learnset).toEqual([{ move: 'ember', level: 1 }, { move: 'growl', level: 1 }, { move: 'flamethrower', level: 34 }])
    expect(s.evolvesTo).toEqual({ species: 'charmeleon', level: 16 })
    expect(s.growthRate).toBe('medium-slow')
    expect(warnings).toEqual([])
  })
  it('omite evolução cujo alvo não está no manifest e avisa', () => {
    const warnings: string[] = []
    const s = toSpecies(pokemon, species, chain, new Set(['charmander']), (m) => warnings.push(m))
    expect(s.evolvesTo).toBeUndefined()
    expect(warnings[0]).toMatch(/charmeleon.*fora do manifest/)
  })
  it('lança em growthRate fora da Gen 1', () => {
    expect(() => toSpecies(pokemon, { ...species, growth_rate: { name: 'erratic' } }, chain, new Set(), () => {})).toThrow(/erratic/)
  })
})

describe('toMove', () => {
  const mv = (over: Partial<PokeApiMove>): PokeApiMove => ({ name: 'ember', power: 40, accuracy: 100, type: { name: 'fire' }, damage_class: { name: 'special' }, ...over })
  it('converte golpe com poder', () => {
    expect(toMove(mv({}))).toEqual({ name: 'ember', type: 'fire', power: 40, accuracy: 100, damageClass: 'special' })
  })
  it('descarta golpes sem poder ou de status', () => {
    expect(toMove(mv({ name: 'growl', power: null, damage_class: { name: 'status' } }))).toBeNull()
    expect(toMove(mv({ power: null }))).toBeNull()
  })
})

describe('toTypeChart', () => {
  it('monta 18x18 com 2, 0.5, 0 e 1 por padrão, ignorando tipos fora da lista', () => {
    const types: PokeApiType[] = TYPE_NAMES.map((name) => ({ name, damage_relations: { double_damage_to: [], half_damage_to: [], no_damage_to: [] } }))
    types[1] = { name: 'fire', damage_relations: { double_damage_to: [{ name: 'grass' }], half_damage_to: [{ name: 'water' }], no_damage_to: [] } }
    types.push({ name: 'shadow', damage_relations: { double_damage_to: [{ name: 'fire' }], half_damage_to: [], no_damage_to: [] } })
    const chart = toTypeChart(types)
    expect(chart.fire.grass).toBe(2)
    expect(chart.fire.water).toBe(0.5)
    expect(chart.fire.fire).toBe(1)
    expect(Object.keys(chart)).toHaveLength(18)
  })
  it('lança se faltar um dos 18 tipos', () => {
    expect(() => toTypeChart([])).toThrow(/normal/)
  })
})
