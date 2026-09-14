import { rawData } from './data-files.js'
import { parseOrThrow } from './parse-or-throw.js'
import { HuntMapSchema, type HuntMap } from './schemas/hunt-map.js'
import { ItemListSchema, type Item } from './schemas/items.js'
import { LootListSchema, type LootTable } from './schemas/loot.js'
import { MoveListSchema, type Move } from './schemas/moves.js'
import { SpeciesListSchema, type Species } from './schemas/species.js'
import { TypeChartSchema, type TypeChart } from './schemas/type-chart.js'

export interface Registry {
  readonly species: ReadonlyMap<string, Species>
  readonly speciesById: ReadonlyMap<number, Species>
  readonly moves: ReadonlyMap<string, Move>
  readonly items: ReadonlyMap<string, Item>
  readonly loot: ReadonlyMap<string, LootTable>
  readonly hunts: ReadonlyMap<string, HuntMap>
  readonly typeChart: TypeChart
}

export interface RawRegistry {
  readonly species: unknown
  readonly moves: unknown
  readonly typeChart: unknown
  readonly items: unknown
  readonly loot: unknown
  readonly hunts: readonly unknown[]
}

function indexBy<T, K>(list: readonly T[], key: (t: T) => K, label: string, problems: string[]): Map<K, T> {
  const map = new Map<K, T>()
  for (const item of list) {
    const k = key(item)
    if (map.has(k)) problems.push(`${label} duplicado: ${String(k)}`)
    map.set(k, item)
  }
  return map
}

function checkReferences(r: Registry, problems: string[]): void {
  for (const s of r.species.values()) {
    for (const l of s.learnset) if (!r.moves.has(l.move)) problems.push(`espécie ${s.name}: golpe ${l.move} não existe em moves`)
    if (s.evolvesTo && !r.species.has(s.evolvesTo.species)) problems.push(`espécie ${s.name}: evolução ${s.evolvesTo.species} não existe`)
  }
  for (const t of r.loot.values()) {
    if (!r.species.has(t.species)) problems.push(`loot: espécie ${t.species} não existe`)
    for (const d of t.drops) if (!r.items.has(d.item)) problems.push(`loot de ${t.species}: item ${d.item} não existe`)
  }
  for (const h of r.hunts.values()) {
    for (const sp of h.spawns) if (!r.species.has(sp.speciesName)) problems.push(`hunt ${h.id}: espécie ${sp.speciesName} não existe`)
  }
}

export function buildRegistry(raw: RawRegistry): Registry {
  const speciesList = parseOrThrow(SpeciesListSchema, raw.species, 'species.json')
  const moveList = parseOrThrow(MoveListSchema, raw.moves, 'moves.json')
  const typeChart = parseOrThrow(TypeChartSchema, raw.typeChart, 'type-chart.json')
  const itemList = parseOrThrow(ItemListSchema, raw.items, 'items.json')
  const lootList = parseOrThrow(LootListSchema, raw.loot, 'loot.json')
  const huntList = raw.hunts.map((h, i) => parseOrThrow(HuntMapSchema, h, `hunts[${i}]`))

  const problems: string[] = []
  const registry: Registry = {
    species: indexBy(speciesList, (s) => s.name, 'nome de espécie', problems),
    speciesById: indexBy(speciesList, (s) => s.id, 'id de espécie', problems),
    moves: indexBy(moveList, (m) => m.name, 'golpe', problems),
    items: indexBy(itemList, (i) => i.id, 'item', problems),
    loot: indexBy(lootList, (l) => l.species, 'loot', problems),
    hunts: indexBy(huntList, (h) => h.id, 'hunt', problems),
    typeChart,
  }
  checkReferences(registry, problems)
  if (problems.length > 0) throw new Error(`registro inconsistente:\n${problems.join('\n')}`)
  return registry
}

let cached: Registry | undefined
export function loadRegistry(): Registry {
  cached ??= buildRegistry(rawData)
  return cached
}
