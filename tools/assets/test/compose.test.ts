import { describe, expect, it } from 'vitest'
import { DIRECTION_NAMES, composeFrame, spriteIndex } from '../src/compose.js'
import { parseDat } from '../src/dat.js'
import { parseSpr, type Rgb } from '../src/spr.js'
import { buildDat, outfitSpec } from './fixtures/dat-fixture.js'
import { buildSpr, solidSprite } from './fixtures/spr-fixture.js'

const RED: Rgb = [255, 0, 0]
const GREEN: Rgb = [0, 255, 0]
const BLUE: Rgb = [0, 0, 255]
const WHITE: Rgb = [255, 255, 255]

function pixel(img: { width: number; data: Uint8Array }, x: number, y: number): number[] {
  const o = (y * img.width + x) * 4
  return Array.from(img.data.subarray(o, o + 4))
}

describe('spriteIndex', () => {
  const thing = parseDat(buildDat({ items: [], outfits: [outfitSpec(2, 1)] })).outfits[0]!

  it('segue a ordem fase > z > y > x > camada > altura > largura', () => {
    expect(spriteIndex(thing, 0, 0, 0, 0, 0, 0, 0)).toBe(0)
    expect(spriteIndex(thing, 1, 0, 0, 0, 0, 0, 0)).toBe(1)
    expect(spriteIndex(thing, 0, 1, 0, 0, 0, 0, 0)).toBe(2)
    expect(spriteIndex(thing, 0, 0, 0, 1, 0, 0, 0)).toBe(4) // direção leste
    expect(spriteIndex(thing, 0, 0, 0, 0, 0, 0, 1)).toBe(16) // segunda fase
  })

  it('faz wrap da fase', () => {
    expect(spriteIndex(thing, 0, 0, 0, 0, 0, 0, 2)).toBe(0)
  })
})

describe('composeFrame', () => {
  // sprites 1..4 são as quatro peças da direção norte, fase 0: (w0,h0)=RED, (w1,h0)=GREEN, (w0,h1)=BLUE, (w1,h1)=WHITE
  const spr = parseSpr(buildSpr([solidSprite(RED), solidSprite(GREEN), solidSprite(BLUE), solidSprite(WHITE)]))
  const outfit = { ...outfitSpec(1, 1), spriteIds: [1, 2, 3, 4, ...Array.from({ length: 12 }, () => 0)] }
  const thing = parseDat(buildDat({ items: [], outfits: [outfit] })).outfits[0]!

  it('posiciona (w0,h0) no canto inferior direito e (w1,h1) no superior esquerdo', () => {
    const img = composeFrame(spr, thing, { patternX: 0, phase: 0 })
    expect(img.width).toBe(64)
    expect(img.height).toBe(64)
    expect(pixel(img, 63, 63)).toEqual([255, 0, 0, 255]) // RED
    expect(pixel(img, 0, 63)).toEqual([0, 255, 0, 255]) // GREEN
    expect(pixel(img, 63, 0)).toEqual([0, 0, 255, 255]) // BLUE
    expect(pixel(img, 0, 0)).toEqual([255, 255, 255, 255]) // WHITE
  })

  it('deixa transparente onde o sprite id é 0', () => {
    const img = composeFrame(spr, thing, { patternX: 1, phase: 0 })
    expect(pixel(img, 63, 63)).toEqual([0, 0, 0, 0])
  })

  it('exporta os nomes de direção na ordem do Tibia', () => {
    expect(DIRECTION_NAMES).toEqual(['north', 'east', 'south', 'west'])
  })
})
