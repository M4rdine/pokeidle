import { describe, expect, it } from 'vitest'
import { SPRITE_PIXELS, decodeSprite, parseSpr, type Rgb } from '../src/spr.js'
import { buildSpr, solidSprite } from './fixtures/spr-fixture.js'

const RED: Rgb = [255, 0, 0]
const BLUE: Rgb = [0, 0, 255]

function pixelAt(rgba: Uint8Array, index: number): number[] {
  return Array.from(rgba.subarray(index * 4, index * 4 + 4))
}

describe('parseSpr', () => {
  it('lê assinatura, contagem e offsets', () => {
    const file = buildSpr([solidSprite(RED), null], 0xdead_beef)
    const spr = parseSpr(file)
    expect(spr.signature).toBe(0xdead_beef)
    expect(spr.spriteCount).toBe(2)
    expect(spr.offsets).toHaveLength(2)
    expect(spr.offsets[0]).toBe(4 + 2 + 8)
    expect(spr.offsets[1]).toBe(0)
  })
})

describe('parseSpr (extended)', () => {
  it('lê a contagem de sprites em u32 quando extended', () => {
    const file = buildSpr([solidSprite(RED), null], 0xdead_beef, true)
    const spr = parseSpr(file, { extended: true })
    expect(spr.spriteCount).toBe(2)
    expect(spr.offsets[0]).toBe(4 + 4 + 8)
    expect(Array.from(decodeSprite(spr, 1).subarray(0, 4))).toEqual([255, 0, 0, 255])
  })
})

describe('decodeSprite', () => {
  it('decodifica um sprite sólido em RGBA opaco', () => {
    const spr = parseSpr(buildSpr([solidSprite(RED)]))
    const rgba = decodeSprite(spr, 1)
    expect(rgba).toHaveLength(SPRITE_PIXELS * 4)
    expect(pixelAt(rgba, 0)).toEqual([255, 0, 0, 255])
    expect(pixelAt(rgba, SPRITE_PIXELS - 1)).toEqual([255, 0, 0, 255])
  })

  it('respeita runs transparentes entre pixels coloridos', () => {
    const pixels: Array<Rgb | null> = Array.from({ length: SPRITE_PIXELS }, () => null)
    pixels[0] = RED
    pixels[33] = BLUE // linha 1, coluna 1
    pixels[SPRITE_PIXELS - 1] = BLUE
    const spr = parseSpr(buildSpr([pixels]))
    const rgba = decodeSprite(spr, 1)
    expect(pixelAt(rgba, 0)).toEqual([255, 0, 0, 255])
    expect(pixelAt(rgba, 1)).toEqual([0, 0, 0, 0])
    expect(pixelAt(rgba, 33)).toEqual([0, 0, 255, 255])
    expect(pixelAt(rgba, SPRITE_PIXELS - 1)).toEqual([0, 0, 255, 255])
  })

  it('devolve transparente para address 0, id 0 e id fora da faixa', () => {
    const spr = parseSpr(buildSpr([solidSprite(RED), null]))
    const empty = new Uint8Array(SPRITE_PIXELS * 4)
    expect(decodeSprite(spr, 2)).toEqual(empty)
    expect(decodeSprite(spr, 0)).toEqual(empty)
    expect(decodeSprite(spr, 99)).toEqual(empty)
  })

  it('lança erro se o RLE exceder 1024 pixels', () => {
    const file = buildSpr([solidSprite(RED)])
    // corrompe o u16 de coloredPixels do primeiro run para 2000
    const bodyStart = 4 + 2 + 4 + 3 + 2
    file[bodyStart + 2] = 2000 & 0xff
    file[bodyStart + 3] = 2000 >> 8
    const spr = parseSpr(file)
    expect(() => decodeSprite(spr, 1)).toThrow(/excesso de pixels/)
  })
})
