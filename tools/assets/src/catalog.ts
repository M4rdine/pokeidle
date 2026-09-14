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
    sprSignature: spr.signature,
    datSignature: dat.signature,
    outfits: dat.outfits.filter(hasSprites).map(toOutfit),
    items: dat.items.filter(hasSprites).map(toItem),
  }
}
