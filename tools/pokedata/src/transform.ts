import { GROWTH_RATES, TYPE_NAMES, type GrowthRate, type Move, type Species, type TypeChart, type TypeName } from '@pokeidle/shared'

const VERSION_GROUP = 'firered-leafgreen'
const LEVEL_UP = 'level-up'
const STAT_KEYS: Record<string, keyof Species['baseStats']> = {
  hp: 'hp', attack: 'attack', defense: 'defense', 'special-attack': 'spAttack', 'special-defense': 'spDefense', speed: 'speed',
}

export interface PokeApiPokemon {
  id: number; name: string; base_experience: number | null
  types: { slot: number; type: { name: string } }[]
  stats: { base_stat: number; stat: { name: string } }[]
  moves: { move: { name: string }; version_group_details: { level_learned_at: number; move_learn_method: { name: string }; version_group: { name: string } }[] }[]
}
export interface PokeApiSpecies { name: string; capture_rate: number; growth_rate: { name: string }; evolution_chain: { url: string } }
export interface PokeApiChainNode { species: { name: string }; evolution_details: { trigger: { name: string }; min_level: number | null }[]; evolves_to: PokeApiChainNode[] }
export interface PokeApiChain { chain: PokeApiChainNode }
export interface PokeApiMove { name: string; power: number | null; accuracy: number | null; type: { name: string }; damage_class: { name: string } }
export interface PokeApiType { name: string; damage_relations: { double_damage_to: { name: string }[]; half_damage_to: { name: string }[]; no_damage_to: { name: string }[] } }

const isTypeName = (n: string): n is TypeName => (TYPE_NAMES as readonly string[]).includes(n)
const isGrowthRate = (n: string): n is GrowthRate => (GROWTH_RATES as readonly string[]).includes(n)

function findNode(node: PokeApiChainNode, name: string): PokeApiChainNode | undefined {
  if (node.species.name === name) return node
  for (const child of node.evolves_to) { const hit = findNode(child, name); if (hit) return hit }
  return undefined
}

function evolutionOf(chain: PokeApiChain, name: string, manifest: ReadonlySet<string>, warn: (m: string) => void): Species['evolvesTo'] {
  const node = findNode(chain.chain, name)
  if (!node) return undefined
  for (const next of node.evolves_to) {
    const detail = next.evolution_details.find((d) => d.trigger.name === LEVEL_UP && d.min_level !== null)
    if (!detail || detail.min_level === null) continue
    if (!manifest.has(next.species.name)) { warn(`${name}: evolução para ${next.species.name} omitida, fora do manifest`); continue }
    return { species: next.species.name, level: detail.min_level }
  }
  return undefined
}

function typesOf(p: PokeApiPokemon, warn: (m: string) => void): Species['types'] {
  return [...p.types].sort((a, b) => a.slot - b.slot).flatMap((t) => {
    const name = t.type.name
    if (isTypeName(name)) return [name]
    warn(`${p.name}: tipo ${name} desconhecido, ignorado`)
    return []
  })
}

function learnsetOf(p: PokeApiPokemon): Species['learnset'] {
  const entries = p.moves.flatMap((m) => {
    const d = m.version_group_details.find((v) => v.version_group.name === VERSION_GROUP && v.move_learn_method.name === LEVEL_UP)
    return d ? [{ move: m.move.name, level: Math.max(1, d.level_learned_at) }] : []
  })
  return [...entries].sort((a, b) => a.level - b.level || a.move.localeCompare(b.move))
}

export function toSpecies(p: PokeApiPokemon, s: PokeApiSpecies, chain: PokeApiChain, manifest: ReadonlySet<string>, warn: (m: string) => void): Species {
  const growth = s.growth_rate.name
  if (!isGrowthRate(growth)) throw new Error(`${p.name}: growthRate ${growth} não é suportada (só as curvas da Gen 1)`)
  const baseStats = Object.fromEntries(p.stats.map((st) => [STAT_KEYS[st.stat.name], st.base_stat])) as Species['baseStats']
  const types = typesOf(p, warn)
  const evolvesTo = evolutionOf(chain, p.name, manifest, warn)
  return {
    id: p.id, name: p.name, types, baseStats,
    baseExperience: p.base_experience ?? 0, growthRate: growth, captureRate: s.capture_rate,
    learnset: learnsetOf(p),
    ...(evolvesTo ? { evolvesTo } : {}),
  }
}

export function toMove(m: PokeApiMove): Move | null {
  const cls = m.damage_class.name
  if (m.power === null || m.power < 1 || (cls !== 'physical' && cls !== 'special')) return null
  if (!isTypeName(m.type.name)) return null
  return { name: m.name, type: m.type.name, power: m.power, accuracy: m.accuracy, damageClass: cls }
}

export function toTypeChart(types: readonly PokeApiType[]): TypeChart {
  const byName = new Map(types.map((t) => [t.name, t]))
  const rows = TYPE_NAMES.map((att) => {
    const t = byName.get(att)
    if (!t) throw new Error(`tipo ${att} ausente nas respostas do PokeAPI`)
    const row = Object.fromEntries(TYPE_NAMES.map((def) => [def, 1])) as Record<TypeName, 0 | 0.5 | 1 | 2>
    const set = (list: { name: string }[], v: 0 | 0.5 | 2): void => { for (const d of list) if (isTypeName(d.name)) row[d.name] = v }
    set(t.damage_relations.double_damage_to, 2); set(t.damage_relations.half_damage_to, 0.5); set(t.damage_relations.no_damage_to, 0)
    return [att, row] as const
  })
  return Object.fromEntries(rows) as TypeChart
}
