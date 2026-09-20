import { rawData } from './data-files.js'
import { parseOrThrow } from './parse-or-throw.js'
import { HuntMapSchema, type HuntMap } from './schemas/hunt-map.js'
import { ItemListSchema, type Item } from './schemas/items.js'
import { LootListSchema, type LootTable } from './schemas/loot.js'
import { MoveListSchema, type Move } from './schemas/moves.js'
import { RegionListSchema, type Region } from './schemas/region.js'
import { SpeciesListSchema, type Species } from './schemas/species.js'
import { TypeChartSchema, type TypeChart } from './schemas/type-chart.js'
import { UnlocksSchema, type Unlocks } from './schemas/unlocks.js'

export interface Registry {
  readonly species: ReadonlyMap<string, Species>
  readonly speciesById: ReadonlyMap<number, Species>
  readonly moves: ReadonlyMap<string, Move>
  readonly items: ReadonlyMap<string, Item>
  readonly loot: ReadonlyMap<string, LootTable>
  readonly hunts: ReadonlyMap<string, HuntMap>
  readonly regions: ReadonlyMap<string, Region>
  readonly typeChart: TypeChart
  readonly unlocks: Unlocks
}

export interface RawRegistry {
  readonly species: unknown
  readonly moves: unknown
  readonly typeChart: unknown
  readonly items: unknown
  readonly loot: unknown
  readonly unlocks: unknown
  readonly regions: unknown
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
  for (const itemId of Object.keys(r.unlocks.items)) {
    if (!r.items.has(itemId)) problems.push(`unlocks: item ${itemId} não existe`)
  }
  // Região e área precisam casar dos dois lados: área sem mapa não é jogável, e mapa sem área
  // nunca aparece no navegador — os dois casos passariam despercebidos sem esta checagem.
  const areasDeclaradas = new Set<string>()
  for (const region of r.regions.values()) {
    for (const area of region.areas) {
      if (areasDeclaradas.has(area.id)) problems.push(`área ${area.id} aparece em mais de uma região`)
      areasDeclaradas.add(area.id)
      if (!r.hunts.has(area.id)) problems.push(`região ${region.id}: área ${area.id} não tem mapa em hunts`)
      for (const sp of area.species) {
        if (!r.species.has(sp)) problems.push(`área ${area.id}: espécie ${sp} não existe`)
      }
    }
  }
  for (const huntId of r.hunts.keys()) {
    if (!areasDeclaradas.has(huntId)) problems.push(`mapa ${huntId} não pertence a nenhuma região`)
  }
  for (const regionId of Object.keys(r.unlocks.regions)) {
    if (!r.regions.has(regionId)) problems.push(`unlocks: região ${regionId} não existe`)
  }
}

export function buildRegistry(raw: RawRegistry): Registry {
  const speciesList = parseOrThrow(SpeciesListSchema, raw.species, 'species.json')
  const moveList = parseOrThrow(MoveListSchema, raw.moves, 'moves.json')
  const typeChart = parseOrThrow(TypeChartSchema, raw.typeChart, 'type-chart.json')
  const itemList = parseOrThrow(ItemListSchema, raw.items, 'items.json')
  const lootList = parseOrThrow(LootListSchema, raw.loot, 'loot.json')
  const unlocks = parseOrThrow(UnlocksSchema, raw.unlocks, 'unlocks.json')
  const huntList = raw.hunts.map((h, i) => parseOrThrow(HuntMapSchema, h, `hunts[${i}]`))
  const regionList = parseOrThrow(RegionListSchema, raw.regions, 'regions.json')

  const problems: string[] = []
  const registry: Registry = {
    species: indexBy(speciesList, (s) => s.name, 'nome de espécie', problems),
    speciesById: indexBy(speciesList, (s) => s.id, 'id de espécie', problems),
    moves: indexBy(moveList, (m) => m.name, 'golpe', problems),
    items: indexBy(itemList, (i) => i.id, 'item', problems),
    loot: indexBy(lootList, (l) => l.species, 'loot', problems),
    hunts: indexBy(huntList, (h) => h.id, 'hunt', problems),
    regions: indexBy(regionList, (r) => r.id, 'região', problems),
    typeChart,
    unlocks,
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
