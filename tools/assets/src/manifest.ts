import { z } from 'zod'
import { parseOrThrow } from '@pokeidle/shared'
import type { Catalog } from './catalog.js'
import { readJson } from './json-file.js'
import { sliceName } from './tile-slice.js'
import { transitionTileNames } from './transition.js'

const KEBAB = /^[a-z0-9-]+$/
const ONLY_DIGITS = /^\d+$/
const REQUIRED_DIRECTIONS = 4
const TILE_SIZE_IN_TILES = 1

const nameSchema = z
  .string()
  .regex(KEBAB, 'use kebab-case ascii')
  .refine((n) => !ONLY_DIGITS.test(n), 'nome não pode ser só dígitos')

const SpeciesSchema = z.object({
  id: z.number().int().positive(),
  name: nameSchema,
  outfitId: z.number().int().positive(),
  attackOutfitId: z.number().int().positive().optional(),
})

const SliceSchema = z.object({ cols: z.number().int().min(1).max(8), rows: z.number().int().min(1).max(8) }).strict()

const TileSchema = z.object({
  name: nameSchema,
  itemId: z.number().int().min(100),
  patternX: z.number().int().min(0).default(0),
  patternY: z.number().int().min(0).default(0),
  slice: SliceSchema.optional(),
})

const TerrainTileSchema = z.object({
  tile: nameSchema,
  // ordem: superior-direito, inferior-direito, inferior-esquerdo, superior-esquerdo
  corners: z.tuple([z.string(), z.string(), z.string(), z.string()]),
}).strict()

const TerrainSchema = z.object({
  name: nameSchema,
  colors: z.array(z.string().min(1)).min(1).max(15), // o Tiled aceita até 15 cores por conjunto
  tiles: z.array(TerrainTileSchema).min(1),
}).strict()

const TransitionSchema = z.object({
  name: nameSchema,
  from: nameSchema,
  to: nameSchema,
  softness: z.number().int().min(1).max(12).optional(),
}).strict()

export const ManifestSchema = z.object({
  version: z.literal(1),
  species: z.array(SpeciesSchema),
  tiles: z.array(TileSchema),
  terrains: z.array(TerrainSchema).optional(),
  transitions: z.array(TransitionSchema).optional(),
})

export type Manifest = z.infer<typeof ManifestSchema>
export type SpeciesEntry = Manifest['species'][number]
export type TileEntry = Manifest['tiles'][number]
export type TerrainEntry = NonNullable<Manifest['terrains']>[number]
export type TransitionEntry = NonNullable<Manifest['transitions']>[number]

export function parseManifest(json: unknown): Manifest {
  return parseOrThrow(ManifestSchema, json, 'manifest')
}

export async function loadManifest(path: string): Promise<Manifest> {
  try {
    return parseManifest(await readJson(path))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`manifest ${path}: ${reason}`)
  }
}

/** Um tile simples vira um nome; um tile fatiado vira um nome por peça, na ordem de leitura. */
export function expandedTileNames(tile: TileEntry): string[] {
  if (!tile.slice) return [tile.name]
  const { cols, rows } = tile.slice
  return Array.from({ length: cols * rows }, (_unused, i) => sliceName(tile.name, i % cols, Math.floor(i / cols)))
}

function duplicates<T>(values: readonly T[]): T[] {
  const seen = new Set<T>()
  const dups = new Set<T>()
  for (const v of values) (seen.has(v) ? dups : seen).add(v)
  return [...dups]
}

function validateSpecies(s: SpeciesEntry, catalog: Catalog): string[] {
  const check = (outfitId: number, role: string): string[] => {
    const outfit = catalog.outfits.find((o) => o.id === outfitId)
    if (!outfit) return [`espécie ${s.name}: ${role} outfit ${outfitId} não existe no catálogo`]
    if (outfit.directions !== REQUIRED_DIRECTIONS) {
      return [`espécie ${s.name}: ${role} outfit ${outfitId} tem ${outfit.directions} direções, esperadas ${REQUIRED_DIRECTIONS} direções`]
    }
    return []
  }
  return [...check(s.outfitId, 'walk'), ...(s.attackOutfitId === undefined ? [] : check(s.attackOutfitId, 'attack'))]
}

function validateTile(t: TileEntry, catalog: Catalog): string[] {
  const item = catalog.items.find((i) => i.id === t.itemId)
  if (!item) return [`tile ${t.name}: item ${t.itemId} não existe no catálogo`]
  const problems: string[] = []
  const big = item.width !== TILE_SIZE_IN_TILES || item.height !== TILE_SIZE_IN_TILES
  if (big && !t.slice) problems.push(`tile ${t.name}: item ${t.itemId} é ${item.width}x${item.height}; use "slice" para cortá-lo em peças de um tile`)
  if (t.slice && (t.slice.cols !== item.width || t.slice.rows !== item.height)) {
    problems.push(`tile ${t.name}: slice ${t.slice.cols}x${t.slice.rows} não bate com o item ${t.itemId}, que é ${item.width}x${item.height}`)
  }
  if (t.patternX >= item.patternX) problems.push(`tile ${t.name}: patternX ${t.patternX} fora da faixa 0..${item.patternX - 1}`)
  if (t.patternY >= item.patternY) problems.push(`tile ${t.name}: patternY ${t.patternY} fora da faixa 0..${item.patternY - 1}`)
  return problems
}

function validateTerrain(t: TerrainEntry, tileNames: ReadonlySet<string>): string[] {
  const problems: string[] = []
  const colors = new Set(t.colors)
  for (const entry of t.tiles) {
    if (!tileNames.has(entry.tile)) problems.push(`terreno ${t.name}: tile "${entry.tile}" não existe na lista de tiles`)
    for (const color of entry.corners) {
      if (!colors.has(color)) problems.push(`terreno ${t.name}: cor "${color}" não está em colors`)
    }
  }
  return problems
}

/** Terrenos declarados e transições viram wangsets no mesmo tiles.tsj: os nomes não podem colidir. */
function duplicateTerrainNames(m: Manifest): string[] {
  const declared = (m.terrains ?? []).map((t) => t.name)
  const fromTransitions = new Set((m.transitions ?? []).map((t) => t.name))
  const colliding = new Set([...duplicates(declared), ...declared.filter((n) => fromTransitions.has(n))])
  return [...colliding].map((n) => `nome de terreno duplicado: ${n}`)
}

function validateTransition(t: TransitionEntry, tileNames: ReadonlySet<string>): string[] {
  const problems: string[] = []
  if (!tileNames.has(t.from)) problems.push(`transição ${t.name}: tile "${t.from}" não existe na lista de tiles`)
  if (!tileNames.has(t.to)) problems.push(`transição ${t.name}: tile "${t.to}" não existe na lista de tiles`)
  if (t.from === t.to) problems.push(`transição ${t.name}: from e to são o mesmo tile`)
  return problems
}

export function validateManifest(m: Manifest, catalog: Catalog): string[] {
  const tileNames = new Set(m.tiles.flatMap(expandedTileNames))
  const generatedNames = (m.transitions ?? []).flatMap(transitionTileNames)
  return [
    ...duplicates(m.species.map((s) => s.name)).map((n) => `nome de espécie duplicado: ${n}`),
    ...duplicates(m.species.map((s) => s.id)).map((id) => `id de espécie duplicado: ${id}`),
    ...duplicates([...m.tiles.flatMap(expandedTileNames), ...generatedNames]).map((n) => `nome de tile duplicado: ${n}`),
    ...m.species.flatMap((s) => validateSpecies(s, catalog)),
    ...m.tiles.flatMap((t) => validateTile(t, catalog)),
    ...duplicateTerrainNames(m),
    ...(m.terrains ?? []).flatMap((t) => validateTerrain(t, tileNames)),
    ...duplicates((m.transitions ?? []).map((t) => t.name)).map((n) => `nome de transição duplicado: ${n}`),
    ...(m.transitions ?? []).flatMap((t) => validateTransition(t, tileNames)),
  ]
}
