import type { Rng } from './rng.js'
import type { LootTable } from './schemas/loot.js'
import type { Species } from './schemas/species.js'

export const DEFAULT_DROP_ITEM = 'potion'
export const DEFAULT_DROP_CHANCE = 0.05
const GOLD_MIN_DIVISOR = 10
const GOLD_MAX_DIVISOR = 5
/** Degrau de raridade da área: 1 é a mais fácil da região, 8 a mais difícil. */
export const MIN_RARITY = 1
export const MAX_RARITY = 8

/**
 * Chance de drop ajustada pelo degrau da área. É a probabilidade de pelo menos um acerto em
 * `rarity` sorteios: cresce de forma decrescente, então o raro continua raro no topo (2 % viram
 * ~15 %) e o comum satura sem passar de 1.
 *
 * Só a chance de drop sobe com o degrau — XP e ouro ficam como estão. Subir os três de uma vez
 * inflaciona a economia e apaga a razão de voltar às áreas antigas.
 */
export function dropChance(base: number, rarity: number): number {
  if (base < 0 || base > 1) throw new RangeError(`chance inválida: ${base}`)
  if (!Number.isInteger(rarity) || rarity < MIN_RARITY || rarity > MAX_RARITY) {
    throw new RangeError(`degrau de raridade inválido: ${rarity} (esperado ${MIN_RARITY}–${MAX_RARITY})`)
  }
  // Atalho no degrau 1 por exatidão, não por velocidade: 1 - (1 - 0,02)**1 devolve
  // 0,020000000000000018, e a chance base tem que sair do ajuste idêntica ao que entrou.
  return rarity === MIN_RARITY ? base : 1 - (1 - base) ** rarity
}

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

/**
 * @param rarity degrau da área onde o selvagem caiu. Afeta só a chance dos drops: o ouro sai da
 * mesma faixa em qualquer área.
 */
export function rollLoot(
  species: Species,
  loot: ReadonlyMap<string, LootTable>,
  rng: Rng,
  rarity: number = MIN_RARITY,
): LootResult {
  const table = lootTableFor(species, loot)
  const gold = rng.int(table.gold[0], table.gold[1])
  const drops = table.drops
    .filter((d) => rng.next() < dropChance(d.chance, rarity))
    .map((d) => ({ item: d.item, quantity: 1 }))
  return { gold, drops }
}
