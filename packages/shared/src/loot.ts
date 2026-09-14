import type { Rng } from './rng.js'
import type { LootTable } from './schemas/loot.js'
import type { Species } from './schemas/species.js'

export const DEFAULT_DROP_ITEM = 'potion'
export const DEFAULT_DROP_CHANCE = 0.05
const GOLD_MIN_DIVISOR = 10
const GOLD_MAX_DIVISOR = 5

export interface LootResult {
  readonly gold: number
  readonly drops: readonly { readonly item: string; readonly quantity: number }[]
}

export function lootTableFor(species: Species, loot: ReadonlyMap<string, LootTable>): LootTable {
  const explicit = loot.get(species.name)
  if (explicit) return explicit
  const be = species.baseExperience
  return {
    species: species.name,
    gold: [Math.floor(be / GOLD_MIN_DIVISOR), Math.floor(be / GOLD_MAX_DIVISOR)],
    drops: [{ item: DEFAULT_DROP_ITEM, chance: DEFAULT_DROP_CHANCE }],
  }
}

export function rollLoot(species: Species, loot: ReadonlyMap<string, LootTable>, rng: Rng): LootResult {
  const table = lootTableFor(species, loot)
  const gold = rng.int(table.gold[0], table.gold[1])
  const drops = table.drops.filter((d) => rng.next() < d.chance).map((d) => ({ item: d.item, quantity: 1 }))
  return { gold, drops }
}
