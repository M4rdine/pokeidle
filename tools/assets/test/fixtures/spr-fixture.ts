import type { Rgb } from '../../src/spr.js'

const SPRITE_PIXELS = 1024

function u16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff]
}

function u32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]
}

/** Codifica 1024 pixels (null = transparente) no RLE do Tibia, sem os 3 bytes de cor-chave nem o u16 de tamanho. */
export function encodeRle(pixels: ReadonlyArray<Rgb | null>): Uint8Array {
  if (pixels.length !== SPRITE_PIXELS) throw new Error(`esperados ${SPRITE_PIXELS} pixels`)
  const out: number[] = []
  let i = 0
  while (i < SPRITE_PIXELS) {
    let transparent = 0
    while (i < SPRITE_PIXELS && pixels[i] === null) {
      transparent++
      i++
    }
    const colored: Rgb[] = []
    while (i < SPRITE_PIXELS && pixels[i] !== null) {
      colored.push(pixels[i] as Rgb)
      i++
    }
    if (transparent === 0 && colored.length === 0) break
    if (colored.length === 0) break // rabo transparente não precisa ser codificado
    out.push(...u16(transparent), ...u16(colored.length))
    for (const [r, g, b] of colored) out.push(r, g, b)
  }
  return new Uint8Array(out)
}

/** Monta um arquivo .spr completo. Cada entrada é a lista de pixels de um sprite, ou null para address 0. */
export function buildSpr(
  sprites: ReadonlyArray<ReadonlyArray<Rgb | null> | null>,
  signature = 0x4a10_0000,
  extended = false,
): Uint8Array {
  const countBytes = extended ? 4 : 2
  const headerSize = 4 + countBytes + sprites.length * 4
  const bodies = sprites.map((s) => (s === null ? null : encodeRle(s)))
  const offsets: number[] = []
  let cursor = headerSize
  const bodyBytes: number[] = []
  for (const body of bodies) {
    if (body === null) {
      offsets.push(0)
      continue
    }
    offsets.push(cursor)
    const chunk = [0xff, 0x00, 0xff, ...u16(body.length), ...body]
    bodyBytes.push(...chunk)
    cursor += chunk.length
  }
  const count = extended ? u32(sprites.length) : u16(sprites.length)
  const header = [...u32(signature), ...count, ...offsets.flatMap(u32)]
  return new Uint8Array([...header, ...bodyBytes])
}

/** Sprite 32x32 preenchido inteiro com uma cor. */
export function solidSprite(color: Rgb): Rgb[] {
  return Array.from({ length: SPRITE_PIXELS }, () => color)
}
