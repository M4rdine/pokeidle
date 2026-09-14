import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { MoveListSchema, SpeciesListSchema, TYPE_NAMES, TypeChartSchema, parseOrThrow, type Move, type Species } from '@pokeidle/shared'
import type { PokeApi } from './pokeapi.js'
import { toMove, toSpecies, toTypeChart, type PokeApiChain, type PokeApiMove, type PokeApiPokemon, type PokeApiSpecies, type PokeApiType } from './transform.js'

export interface SyncOptions {
  readonly api: PokeApi
  readonly speciesNames: readonly string[]
  readonly outDir: string
  readonly warn?: (msg: string) => void
}

const chainIdFromUrl = (url: string): string => url.replace(/\/$/, '').split('/').at(-1) ?? ''

async function fetchSpecies(api: PokeApi, name: string, manifest: ReadonlySet<string>, warn: (m: string) => void): Promise<Species> {
  const [pokemon, species] = await Promise.all([api.get<PokeApiPokemon>(`pokemon/${name}`), api.get<PokeApiSpecies>(`pokemon-species/${name}`)])
  const chain = await api.get<PokeApiChain>(`evolution-chain/${chainIdFromUrl(species.evolution_chain.url)}`)
  return toSpecies(pokemon, species, chain, manifest, warn)
}

async function fetchMoves(api: PokeApi, names: readonly string[], warn: (m: string) => void): Promise<Move[]> {
  const moves: Move[] = []
  for (const name of names) {
    const move = toMove(await api.get<PokeApiMove>(`move/${name}`))
    if (move === null) { warn(`golpe ${name} descartado: sem poder ou de status`); continue }
    moves.push(move)
  }
  return [...moves].sort((a, b) => a.name.localeCompare(b.name))
}

const write = async (dir: string, file: string, data: unknown): Promise<void> => writeFile(join(dir, file), `${JSON.stringify(data, null, 2)}\n`)

export async function sync(opts: SyncOptions): Promise<{ species: number; moves: number }> {
  const warn = opts.warn ?? (() => {})
  const manifest = new Set(opts.speciesNames)
  const speciesList: Species[] = []
  for (const name of opts.speciesNames) speciesList.push(await fetchSpecies(opts.api, name, manifest, warn))
  const sortedSpecies = [...speciesList].sort((a, b) => a.id - b.id)

  const moveNames = [...new Set(sortedSpecies.flatMap((s) => s.learnset.map((l) => l.move)))].sort()
  const moves = await fetchMoves(opts.api, moveNames, warn)
  const kept = new Set(moves.map((m) => m.name))
  const species = sortedSpecies.map((s) => ({ ...s, learnset: s.learnset.filter((l) => kept.has(l.move)) }))
  for (const s of species) if (s.learnset.length < 2) warn(`${s.name}: só ${s.learnset.length} golpe(s) com poder no learnset`)

  const types: PokeApiType[] = []
  for (const t of TYPE_NAMES) types.push(await opts.api.get<PokeApiType>(`type/${t}`))
  const chart = toTypeChart(types)

  await mkdir(opts.outDir, { recursive: true })
  await write(opts.outDir, 'species.json', parseOrThrow(SpeciesListSchema, species, 'species.json'))
  await write(opts.outDir, 'moves.json', parseOrThrow(MoveListSchema, moves, 'moves.json'))
  await write(opts.outDir, 'type-chart.json', parseOrThrow(TypeChartSchema, chart, 'type-chart.json'))
  return { species: species.length, moves: moves.length }
}
