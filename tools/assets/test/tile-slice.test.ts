import { describe, expect, it } from 'vitest'
import type { RgbaImage } from '../src/compose.js'
import { sliceImage, sliceName } from '../src/tile-slice.js'

/** Imagem 64×64 em que cada quadrante 32×32 tem uma cor sólida distinta. */
function quadrants(): RgbaImage {
  const width = 64
  const height = 64
  const data = new Uint8Array(width * height * 4)
  const colors = [10, 20, 30, 40]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const quadrant = (y < 32 ? 0 : 2) + (x < 32 ? 0 : 1)
      const i = (y * width + x) * 4
      data[i] = colors[quadrant]!
      data[i + 1] = 0
      data[i + 2] = 0
      data[i + 3] = 255
    }
  }
  return { width, height, data }
}

const firstPixel = (img: RgbaImage): number => img.data[0]!

describe('sliceImage', () => {
  it('corta 2×2 em quatro peças de 32×32, na ordem de leitura', () => {
    const pieces = sliceImage(quadrants(), 2, 2)
    expect(pieces).toHaveLength(4)
    expect(pieces.map((p) => [p.width, p.height])).toEqual([[32, 32], [32, 32], [32, 32], [32, 32]])
    expect(pieces.map(firstPixel)).toEqual([10, 20, 30, 40])
  })
  it('1×1 devolve a imagem inteira', () => {
    const img = quadrants()
    expect(sliceImage(img, 1, 1)).toEqual([img])
  })
  it('recusa corte que não divide a imagem', () => {
    expect(() => sliceImage(quadrants(), 3, 2)).toThrow(/não divide/)
  })
})

describe('sliceName', () => {
  it('nomeia pela posição', () => {
    expect(sliceName('pokecenter', 0, 2)).toBe('pokecenter-x0-y2')
  })
})
