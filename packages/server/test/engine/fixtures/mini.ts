import { buildRegistry, createRng, hpAt, xpForLevel, TYPE_NAMES, type HuntMap, type Registry } from '@pokeidle/shared'
import { createHuntState, defaultSettings } from '../../../src/engine/create.js'
import type { EngineDeps, HuntState, PokemonState } from '../../../src/engine/types.js'

const stats = (hp: number, attack: number, defense: number, spAttack: number, spDefense: number, speed: number) => ({ hp, attack, defense, spAttack, spDefense, speed })
const chartRows = Object.fromEntries(TYPE_NAMES.map((a) => [a, Object.fromEntries(TYPE_NAMES.map((d) => [d, 1]))])) as Record<string, Record<string, number>>
const typeChart = { ...chartRows, fire: { ...chartRows.fire, grass: 2, water: 0.5 }, normal: { ...chartRows.normal, ghost: 0 } }

export function miniRegistry(): Registry {
  return buildRegistry({
    species: [
      { id: 4, name: 'charmander', types: ['fire'], baseStats: stats(39, 52, 43, 60, 50, 65), baseExperience: 62, growthRate: 'medium-slow', captureRate: 45, learnset: [{ move: 'scratch', level: 1 }, { move: 'ember', level: 1 }, { move: 'flamethrower', level: 34 }], evolvesTo: { species: 'charmeleon', level: 16 } },
      { id: 5, name: 'charmeleon', types: ['fire'], baseStats: stats(58, 64, 58, 80, 65, 80), baseExperience: 142, growthRate: 'medium-slow', captureRate: 45, learnset: [{ move: 'scratch', level: 1 }, { move: 'ember', level: 1 }] },
      { id: 41, name: 'zubat', types: ['poison', 'flying'], baseStats: stats(40, 45, 35, 30, 40, 55), baseExperience: 49, growthRate: 'medium-fast', captureRate: 255, learnset: [{ move: 'leech-life', level: 1 }] },
      { id: 92, name: 'gastly', types: ['ghost', 'poison'], baseStats: stats(30, 35, 30, 100, 35, 80), baseExperience: 62, growthRate: 'medium-slow', captureRate: 190, learnset: [{ move: 'lick', level: 1 }] },
      { id: 81, name: 'magnemite', types: ['electric', 'steel'], baseStats: stats(25, 35, 70, 95, 55, 45), baseExperience: 65, growthRate: 'medium-fast', captureRate: 190, learnset: [{ move: 'tackle', level: 1 }] },
    ],
    moves: [
      { name: 'ember', type: 'fire', power: 40, accuracy: 100, damageClass: 'special' },
      { name: 'scratch', type: 'normal', power: 40, accuracy: 100, damageClass: 'physical' },
      { name: 'flamethrower', type: 'fire', power: 90, accuracy: 100, damageClass: 'special' },
      { name: 'leech-life', type: 'bug', power: 80, accuracy: 100, damageClass: 'physical' },
      { name: 'lick', type: 'ghost', power: 30, accuracy: 100, damageClass: 'physical' },
      { name: 'tackle', type: 'normal', power: 40, accuracy: 100, damageClass: 'physical' },
    ],
    typeChart,
    items: [
      { id: 'potion', name: 'Poção', kind: 'potion', healPercent: 20, buyPrice: 100, sellPrice: 50 },
      { id: 'super-potion', name: 'Super Poção', kind: 'potion', healPercent: 50, buyPrice: 400, sellPrice: 200 },
      { id: 'hyper-potion', name: 'Hiper', kind: 'potion', healPercent: 100, buyPrice: 1500, sellPrice: 750 },
      { id: 'poke-ball', name: 'Poké Bola', kind: 'ball', ballBonus: 1, buyPrice: 200, sellPrice: 100 },
      { id: 'great-ball', name: 'Great Bola', kind: 'ball', ballBonus: 1.5, buyPrice: 600, sellPrice: 300 },
      { id: 'ultra-ball', name: 'Ultra Bola', kind: 'ball', ballBonus: 2, buyPrice: 1200, sellPrice: 600 },
    ],
    loot: [{ species: 'zubat', gold: [4, 9], drops: [{ item: 'potion', chance: 0.08 }] }],
    unlocks: { growthRate: 'medium-fast', teamSlots: [{ level: 1, slots: 6 }], items: {}, regions: {} },
    regions: [{
      id: 'mini-regiao', name: 'Mini', order: 1, minTrainerLevel: 1, width: 5, height: 5,
      areas: [{ id: 'mini', name: 'Mini', bounds: { x: 0, y: 0, width: 5, height: 5 }, anchor: { x: 2, y: 2 }, species: ['zubat'], minLevel: 3, maxLevel: 3, wildCount: 3, respawnSeconds: 20, minTrainerLevel: 1, rarity: 1 }],
    }],
    hunts: [miniHunt()],
  })
}

export function miniHunt(): HuntMap {
  const size = 25
  const blocking = Array.from({ length: size }, (_, i) => i === 1 * 5 + 2)
  return {
    id: 'mini', name: 'Mini', width: 5, height: 5, tileSize: 32,
    layers: { ground: Array(size).fill('grass'), detail: Array(size).fill(null), blocking },
    spawnPoint: { x: 0, y: 0 }, pokecenter: { x: 4, y: 4 },
    spawns: [{ speciesName: 'zubat', minLevel: 3, maxLevel: 3, x: 3, y: 1, radius: 0, count: 1, respawnSeconds: 2 }],
  }
}

export const miniDeps = (seed = 1): EngineDeps => ({ registry: miniRegistry(), hunt: miniHunt(), rng: createRng(seed) })

export const charmander5 = (): PokemonState => ({ id: 'p1', speciesName: 'charmander', level: 5, xp: xpForLevel('medium-slow', 5), hp: hpAt(39, 5), hpMax: hpAt(39, 5) })

export function baseState(over: Partial<HuntState> = {}, deps: EngineDeps = miniDeps()): HuntState {
  const state = createHuntState({ hunt: deps.hunt, sessionId: 'mini', team: [charmander5()], inventory: { potion: 1, 'poke-ball': 2 }, settings: defaultSettings() }, deps)
  return { ...state, ...over }
}
