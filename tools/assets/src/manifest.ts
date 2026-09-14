import { z } from 'zod'
import { parseOrThrow } from '@pokeidle/shared'
import type { Catalog } from './catalog.js'
import { readJson } from './json-file.js'

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

const TileSchema = z.object({
  name: nameSchema,
  itemId: z.number().int().min(100),
  patternX: z.number().int().min(0).default(0),
  patternY: z.number().int().min(0).default(0),
})

export const ManifestSchema = z.object({
  version: z.literal(1),
  species: z.array(SpeciesSchema),
  tiles: z.array(TileSchema),
})

export type Manifest = z.infer<typeof ManifestSchema>
export type SpeciesEntry = Manifest['species'][number]
export type TileEntry = Manifest['tiles'][number]

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
  if (item.width !== TILE_SIZE_IN_TILES || item.height !== TILE_SIZE_IN_TILES) {
    problems.push(`tile ${t.name}: item ${t.itemId} é ${item.width}x${item.height}, tiles devem ser 1x1`)
  }
  if (t.patternX >= item.patternX) problems.push(`tile ${t.name}: patternX ${t.patternX} fora da faixa 0..${item.patternX - 1}`)
  if (t.patternY >= item.patternY) problems.push(`tile ${t.name}: patternY ${t.patternY} fora da faixa 0..${item.patternY - 1}`)
  return problems
}

export function validateManifest(m: Manifest, catalog: Catalog): string[] {
  return [
    ...duplicates(m.species.map((s) => s.name)).map((n) => `nome de espécie duplicado: ${n}`),
    ...duplicates(m.species.map((s) => s.id)).map((id) => `id de espécie duplicado: ${id}`),
    ...duplicates(m.tiles.map((t) => t.name)).map((n) => `nome de tile duplicado: ${n}`),
    ...m.species.flatMap((s) => validateSpecies(s, catalog)),
    ...m.tiles.flatMap((t) => validateTile(t, catalog)),
  ]
}
