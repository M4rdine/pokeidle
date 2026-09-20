import { rawContent } from './content-files.js'
import { parseOrThrow } from './parse-or-throw.js'
import { HuntMapSchema, type HuntMap } from './schemas/hunt-map.js'
import { ItemListSchema, type Item } from './schemas/items.js'
import { LootListSchema, type LootTable } from './schemas/loot.js'
import { MoveListSchema, type Move } from './schemas/moves.js'
import { RegionListSchema, type Region } from './schemas/region.js'
import { SpeciesListSchema, type Species } from './schemas/species.js'
import { TypeChartSchema, type TypeChart } from './schemas/type-chart.js'
import { UnlocksSchema, type Unlocks } from './schemas/unlocks.js'

/**
 * Tudo que descreve o conteúdo do jogo menos os mapas jogáveis: é o que o cliente carrega.
 * Os mapas ficam em `Registry`, que só o servidor e as ferramentas montam.
 */
export interface ContentRegistry {
  readonly species: ReadonlyMap<string, Species>
  readonly speciesById: ReadonlyMap<number, Species>
  readonly moves: ReadonlyMap<string, Move>
  readonly items: ReadonlyMap<string, Item>
  readonly loot: ReadonlyMap<string, LootTable>
  readonly regions: ReadonlyMap<string, Region>
  readonly typeChart: TypeChart
  readonly unlocks: Unlocks
}

export interface Registry extends ContentRegistry {
  readonly hunts: ReadonlyMap<string, HuntMap>
}

export interface RawContent {
  readonly species: unknown
  readonly moves: unknown
  readonly typeChart: unknown
  readonly items: unknown
  readonly loot: unknown
  readonly unlocks: unknown
  readonly regions: unknown
}

export interface RawRegistry extends RawContent {
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

/** Checagens que não dependem dos mapas: valem tanto no cliente quanto no servidor. */
function checkContent(r: ContentRegistry, problems: string[]): void {
  for (const s of r.species.values()) {
    for (const l of s.learnset) if (!r.moves.has(l.move)) problems.push(`espécie ${s.name}: golpe ${l.move} não existe em moves`)
    if (s.evolvesTo && !r.species.has(s.evolvesTo.species)) problems.push(`espécie ${s.name}: evolução ${s.evolvesTo.species} não existe`)
  }
  for (const t of r.loot.values()) {
    if (!r.species.has(t.species)) problems.push(`loot: espécie ${t.species} não existe`)
    for (const d of t.drops) if (!r.items.has(d.item)) problems.push(`loot de ${t.species}: item ${d.item} não existe`)
  }
  for (const itemId of Object.keys(r.unlocks.items)) {
    if (!r.items.has(itemId)) problems.push(`unlocks: item ${itemId} não existe`)
  }
  checkEconomy(r, problems)
  const areasDeclaradas = new Set<string>()
  for (const region of r.regions.values()) {
    for (const area of region.areas) {
      if (areasDeclaradas.has(area.id)) problems.push(`área ${area.id} aparece em mais de uma região`)
      areasDeclaradas.add(area.id)
      for (const sp of area.species) {
        if (!r.species.has(sp)) problems.push(`área ${area.id}: espécie ${sp} não existe`)
      }
    }
  }
  for (const regionId of Object.keys(r.unlocks.regions)) {
    if (!r.regions.has(regionId)) problems.push(`unlocks: região ${regionId} não existe`)
  }
}

/**
 * Toda espécie precisa de um caminho até o jogador: uma área onde ela apareça, uma evolução que a
 * produza, ou a declaração de que ela vem da escolha inicial ou é lendária. Espécie sem nenhum
 * desses caminhos é conteúdo que ninguém alcança e Pokédex que nunca fecha.
 */
function checkReachableSpecies(r: ContentRegistry, problems: string[]): void {
  const comArea = new Set([...r.regions.values()].flatMap((região) => região.areas.flatMap((a) => a.species)))
  const porEvolucao = new Set([...r.species.values()].flatMap((s) => (s.evolvesTo ? [s.evolvesTo.species] : [])))
  for (const s of r.species.values()) {
    if (comArea.has(s.name) || porEvolucao.has(s.name) || s.obtainable !== undefined) continue
    problems.push(`espécie ${s.name}: não aparece em nenhuma área, não vem de evolução e não declara obtainable`)
  }
}

/**
 * Um item existe para ser conseguido. A referência descobriu em produção que 34 evoluções
 * dependiam de uma pedra que nenhuma hunt dropava; a checagem custa pouco e fecha essa classe
 * inteira de bug antes do jogo subir.
 */
function checkEconomy(r: ContentRegistry, problems: string[]): void {
  const obtenivel = new Set<string>()
  for (const item of r.items.values()) if (item.buyPrice > 0) obtenivel.add(item.id)
  for (const tabela of r.loot.values()) for (const d of tabela.drops) obtenivel.add(d.item)

  for (const itemId of Object.keys(r.unlocks.items)) {
    if (r.items.has(itemId) && !obtenivel.has(itemId)) {
      problems.push(`item ${itemId} é exigido mas não cai de ninguém nem está à venda`)
    }
  }
  for (const item of r.items.values()) {
    if (item.buyPrice > 0 && item.sellPrice >= item.buyPrice) {
      problems.push(`item ${item.id}: vender por ${item.sellPrice} rende mais que comprar por ${item.buyPrice}`)
    }
  }
  for (const tabela of r.loot.values()) {
    for (const d of tabela.drops) {
      if (d.chance <= 0) problems.push(`loot de ${tabela.species}: ${d.item} tem chance ${d.chance} e nunca cai`)
    }
  }
}

/**
 * Região e área precisam casar dos dois lados: área sem mapa não é jogável, e mapa sem área nunca
 * aparece no navegador — os dois casos passariam despercebidos sem esta checagem.
 */
function checkHunts(r: Registry, problems: string[]): void {
  for (const h of r.hunts.values()) {
    for (const sp of h.spawns) if (!r.species.has(sp.speciesName)) problems.push(`hunt ${h.id}: espécie ${sp.speciesName} não existe`)
  }
  const areasDeclaradas = new Set<string>()
  for (const region of r.regions.values()) {
    for (const area of region.areas) {
      areasDeclaradas.add(area.id)
      if (!r.hunts.has(area.id)) problems.push(`região ${region.id}: área ${area.id} não tem mapa em hunts`)
    }
  }
  for (const huntId of r.hunts.keys()) {
    if (!areasDeclaradas.has(huntId)) problems.push(`mapa ${huntId} não pertence a nenhuma região`)
  }
}

const raise = (problems: readonly string[]): void => {
  if (problems.length > 0) throw new Error(`registro inconsistente:\n${problems.join('\n')}`)
}

function parseContent(raw: RawContent, problems: string[]): ContentRegistry {
  const speciesList = parseOrThrow(SpeciesListSchema, raw.species, 'species.json')
  return {
    species: indexBy(speciesList, (s) => s.name, 'nome de espécie', problems),
    speciesById: indexBy(speciesList, (s) => s.id, 'id de espécie', problems),
    moves: indexBy(parseOrThrow(MoveListSchema, raw.moves, 'moves.json'), (m) => m.name, 'golpe', problems),
    items: indexBy(parseOrThrow(ItemListSchema, raw.items, 'items.json'), (i) => i.id, 'item', problems),
    loot: indexBy(parseOrThrow(LootListSchema, raw.loot, 'loot.json'), (l) => l.species, 'loot', problems),
    regions: indexBy(parseOrThrow(RegionListSchema, raw.regions, 'regions.json'), (r) => r.id, 'região', problems),
    typeChart: parseOrThrow(TypeChartSchema, raw.typeChart, 'type-chart.json'),
    unlocks: parseOrThrow(UnlocksSchema, raw.unlocks, 'unlocks.json'),
  }
}

export function buildContentRegistry(raw: RawContent): ContentRegistry {
  const problems: string[] = []
  const content = parseContent(raw, problems)
  checkContent(content, problems)
  raise(problems)
  return content
}

export function buildRegistry(raw: RawRegistry): Registry {
  const problems: string[] = []
  const registry: Registry = {
    ...parseContent(raw, problems),
    hunts: indexBy(raw.hunts.map((h, i) => parseOrThrow(HuntMapSchema, h, `hunts[${i}]`)), (h) => h.id, 'hunt', problems),
  }
  checkContent(registry, problems)
  checkHunts(registry, problems)
  raise(problems)
  return registry
}

let cachedContent: ContentRegistry | undefined
/** Registro sem os mapas, para o cliente: ver `content-files.ts` para o porquê. */
export function loadContentRegistry(): ContentRegistry {
  cachedContent ??= buildContentRegistry(rawContent)
  return cachedContent
}
