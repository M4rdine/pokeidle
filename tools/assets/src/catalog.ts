import { z } from 'zod'
import { parseOrThrow } from '@pokeidle/shared'
import { FLAG_CONTAINER, FLAG_GROUND, FLAG_LIGHT, FLAG_LYING_CORPSE, FLAG_NOT_PATHABLE, FLAG_NOT_WALKABLE, FLAG_SPLASH, type DatFile, type DatVersion, type ThingType } from './dat.js'
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
  /** Poça de líquido no chão. Ver `FLAG_SPLASH`. */
  readonly isSplash: boolean
  /** Corpo caído. Ver `FLAG_LYING_CORPSE`. */
  readonly isCorpse: boolean
  /** Guarda coisas dentro. Cadáver é container: é dele que se saqueia. */
  readonly isContainer: boolean
  /** O monstro não traça rota por cima. */
  readonly isNotPathable: boolean
  readonly hasLight: boolean
}

/**
 * Um efeito mágico ou um projétil do `.dat`.
 *
 * O formato tem QUATRO categorias — itens, outfits, efeitos e projéteis — e este extrator lia as
 * duas primeiras e jogava as outras fora. São 658 efeitos animados e 89 projéteis, e neste dump
 * eles são de POKÉMON: lança-chamas em cone, raio de gelo em segmentos, folha navalha, osso,
 * trovão, sono, e as próprias Pokébolas arremessadas com rastro. Estavam no disco desde sempre.
 *
 * O projétil tem OITO DIREÇÕES (padrão 3×3 sem o centro) e o efeito tem fases; por isso os dois
 * cabem na mesma forma, com `directions` valendo 1 para o efeito.
 */
export interface CatalogAnimation {
  readonly id: number
  readonly width: number
  readonly height: number
  readonly directions: number
  readonly phases: number
}

export interface Catalog {
  readonly version: DatVersion
  readonly extended: boolean
  readonly sprSignature: number
  readonly datSignature: number
  readonly outfits: readonly CatalogOutfit[]
  readonly items: readonly CatalogItem[]
  readonly effects: readonly CatalogAnimation[]
  readonly missiles: readonly CatalogAnimation[]
}

const toAnimation = (t: ThingType): CatalogAnimation => ({
  id: t.id, width: t.width, height: t.height, directions: t.patternX, phases: t.phases,
})

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
    isSplash: t.flags.has(FLAG_SPLASH),
    isCorpse: t.flags.has(FLAG_LYING_CORPSE),
    isContainer: t.flags.has(FLAG_CONTAINER),
    isNotPathable: t.flags.has(FLAG_NOT_PATHABLE),
    hasLight: t.flags.has(FLAG_LIGHT),
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
    effects: dat.effects.filter(hasSprites).map(toAnimation),
    missiles: dat.missiles.filter(hasSprites).map(toAnimation),
  }
}

const DisplacementSchema = z.object({ x: z.number().int(), y: z.number().int() })

const CatalogAnimationSchema = z.object({
  id: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  directions: z.number().int().positive(),
  phases: z.number().int().positive(),
})

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
  isSplash: z.boolean(),
  isCorpse: z.boolean(),
  isContainer: z.boolean(),
  isNotPathable: z.boolean(),
  hasLight: z.boolean(),
})

export const CatalogSchema = z.object({
  version: z.union([z.literal(854), z.literal(860)]),
  extended: z.boolean(),
  sprSignature: z.number().int(),
  datSignature: z.number().int(),
  outfits: z.array(CatalogOutfitSchema),
  items: z.array(CatalogItemSchema),
  effects: z.array(CatalogAnimationSchema),
  missiles: z.array(CatalogAnimationSchema),
})

export function parseCatalog(json: unknown): Catalog {
  return parseOrThrow(CatalogSchema, json, 'catalog.json')
}
