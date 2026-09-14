import type { ThingType } from './dat.js'
import { SPRITE_SIZE, decodeSprite, type SprFile } from './spr.js'

const BYTES_PER_RGBA = 4

export const DIRECTION_NAMES = ['north', 'east', 'south', 'west'] as const
export type DirectionName = (typeof DIRECTION_NAMES)[number]

export interface RgbaImage {
  readonly width: number
  readonly height: number
  readonly data: Uint8Array
}

export interface FrameSelector {
  readonly layer?: number
  readonly patternX: number
  readonly patternY?: number
  readonly patternZ?: number
  readonly phase: number
}

export function spriteIndex(
  t: ThingType,
  w: number,
  h: number,
  layer: number,
  x: number,
  y: number,
  z: number,
  phase: number,
): number {
  const p = phase % t.phases
  return ((((((p * t.patternZ + z) * t.patternY + y) * t.patternX + x) * t.layers + layer) * t.height + h) * t.width + w)
}

function blit(src: Uint8Array, dst: Uint8Array, dstWidth: number, originX: number, originY: number): void {
  for (let y = 0; y < SPRITE_SIZE; y++) {
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const s = (y * SPRITE_SIZE + x) * BYTES_PER_RGBA
      if (src[s + 3] === 0) continue
      const d = ((originY + y) * dstWidth + originX + x) * BYTES_PER_RGBA
      dst[d] = src[s]!
      dst[d + 1] = src[s + 1]!
      dst[d + 2] = src[s + 2]!
      dst[d + 3] = src[s + 3]!
    }
  }
}

export function composeFrame(spr: SprFile, thing: ThingType, sel: FrameSelector): RgbaImage {
  const width = thing.width * SPRITE_SIZE
  const height = thing.height * SPRITE_SIZE
  const data = new Uint8Array(width * height * BYTES_PER_RGBA)
  const layer = sel.layer ?? 0
  const y = sel.patternY ?? 0
  const z = sel.patternZ ?? 0
  for (let h = 0; h < thing.height; h++) {
    for (let w = 0; w < thing.width; w++) {
      const id = thing.spriteIds[spriteIndex(thing, w, h, layer, sel.patternX, y, z, sel.phase)] ?? 0
      if (id === 0) continue
      const originX = (thing.width - w - 1) * SPRITE_SIZE
      const originY = (thing.height - h - 1) * SPRITE_SIZE
      blit(decodeSprite(spr, id), data, width, originX, originY)
    }
  }
  return { width, height, data }
}
