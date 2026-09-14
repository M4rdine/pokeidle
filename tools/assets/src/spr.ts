import { BinaryReader } from './binary-reader.js'

export const SPRITE_SIZE = 32
export const SPRITE_PIXELS = SPRITE_SIZE * SPRITE_SIZE
const COLOR_KEY_BYTES = 3
const BYTES_PER_RGBA = 4

export type Rgb = readonly [number, number, number]

export interface SprFile {
  readonly signature: number
  readonly spriteCount: number
  readonly offsets: readonly number[]
  readonly data: Uint8Array
}

export function parseSpr(data: Uint8Array): SprFile {
  const reader = BinaryReader.fromBuffer(data)
  const signature = reader.u32()
  const spriteCount = reader.u16()
  const offsets = Array.from({ length: spriteCount }, () => reader.u32())
  return { signature, spriteCount, offsets, data }
}

/** Decodifica o sprite `id` (1-based) para RGBA 32x32. Ids inválidos ou vazios viram transparente. */
export function decodeSprite(spr: SprFile, id: number): Uint8Array {
  const rgba = new Uint8Array(SPRITE_PIXELS * BYTES_PER_RGBA)
  if (id <= 0 || id > spr.spriteCount) return rgba
  const address = spr.offsets[id - 1] ?? 0
  if (address === 0) return rgba

  const reader = BinaryReader.fromBuffer(spr.data)
  reader.seek(address)
  reader.bytes(COLOR_KEY_BYTES)
  const size = reader.u16()
  const end = reader.position + size

  let pixel = 0
  while (reader.position < end) {
    const transparent = reader.u16()
    const colored = reader.u16()
    pixel += transparent
    for (let i = 0; i < colored; i++) {
      if (pixel >= SPRITE_PIXELS) throw new Error(`sprite ${id}: excesso de pixels no RLE`)
      const o = pixel * BYTES_PER_RGBA
      rgba[o] = reader.u8()
      rgba[o + 1] = reader.u8()
      rgba[o + 2] = reader.u8()
      rgba[o + 3] = 255
      pixel++
    }
  }
  return rgba
}
