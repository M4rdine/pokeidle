import { z } from 'zod'
import { parseOrThrow } from './parse-or-throw.js'
import { FLAG_GROUND, FLAG_NOT_WALKABLE, type DatFile, type DatVersion, type ThingType } from './dat.js'
import type { SprFile } from './spr.js'

export interface CatalogOutfit {
  readonly id: number
  readonly width: number
  readonly height: number
  readonly directions: number
  readonly phases: number
  readonly layers: number
  readonly displacement: { readonly x: number; readonly y: number }
}

export interface CatalogItem {
  readonly id: number
  readonly width: number
  readonly height: number
  readonly patternX: number
  readonly patternY: number
  readonly phases: number
  readonly isGround: boolean
  readonly isBlocking: boolean
}

export interface Catalog {
  readonly version: DatVersion
  readonly extended: boolean
  readonly sprSignature: number
  readonly datSignature: number
  readonly outfits: readonly CatalogOutfit[]
  readonly items: readonly CatalogItem[]
}

export function hasSprites(t: ThingType): boolean {
  return t.spriteIds.some((id) => id !== 0)
}

function toOutfit(t: ThingType): CatalogOutfit {
  return {
    id: t.id,
    width: t.width,
    height: t.height,
    directions: t.patternX,
    phases: t.phases,
    layers: t.layers,
    displacement: t.displacement,
  }
}

function toItem(t: ThingType): CatalogItem {
  return {
    id: t.id,
    width: t.width,
    height: t.height,
    patternX: t.patternX,
    patternY: t.patternY,
    phases: t.phases,
    isGround: t.flags.has(FLAG_GROUND),
    isBlocking: t.flags.has(FLAG_NOT_WALKABLE),
  }
}

export function buildCatalog(spr: SprFile, dat: DatFile): Catalog {
  return {
    version: dat.version,
    extended: dat.extended,
    sprSignature: spr.signature,
    datSignature: dat.signature,
    outfits: dat.outfits.filter(hasSprites).map(toOutfit),
    items: dat.items.filter(hasSprites).map(toItem),
  }
}

const DisplacementSchema = z.object({ x: z.number().int(), y: z.number().int() })

const CatalogOutfitSchema = z.object({
  id: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  directions: z.number().int().positive(),
  phases: z.number().int().positive(),
  layers: z.number().int().positive(),
  displacement: DisplacementSchema,
})

const CatalogItemSchema = z.object({
  id: z.number().int().min(100),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  patternX: z.number().int().positive(),
  patternY: z.number().int().positive(),
  phases: z.number().int().positive(),
  isGround: z.boolean(),
  isBlocking: z.boolean(),
})

export const CatalogSchema = z.object({
  version: z.union([z.literal(854), z.literal(860)]),
  extended: z.boolean(),
  sprSignature: z.number().int(),
  datSignature: z.number().int(),
  outfits: z.array(CatalogOutfitSchema),
  items: z.array(CatalogItemSchema),
})

export function parseCatalog(json: unknown): Catalog {
  return parseOrThrow(CatalogSchema, json, 'catalog.json')
}
