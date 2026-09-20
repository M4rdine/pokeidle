import { describe, expect, it } from 'vitest'
import type { RgbaImage } from '../src/compose.js'
import { harmonize } from '../src/harmonize.js'

const img = (pixels: [number, number, number][]): RgbaImage => ({
  width: pixels.length,
  height: 1,
  data: new Uint8Array(pixels.flatMap(([r, g, b]) => [r, g, b, 255])),
})
const px = (i: RgbaImage, n: number): [number, number, number] => [i.data[n * 4]!, i.data[n * 4 + 1]!, i.data[n * 4 + 2]!]

describe('harmonize', () => {
  it('leva a cor medida de cada material até a canônica', () => {
    const entrada = img([[100, 200, 100], [50, 50, 200]])
    const out = harmonize(entrada, [
      { measured: [100, 200, 100], canonical: [80, 160, 80] },
      { measured: [50, 50, 200], canonical: [50, 50, 200] },
    ])
    expect(px(out, 0)).toEqual([80, 160, 80])
    expect(px(out, 1)).toEqual([50, 50, 200])
  })

  it('preserva o sombreado: pixel mais escuro continua proporcionalmente mais escuro', () => {
    const entrada = img([[100, 200, 100], [50, 100, 50]])
    const out = harmonize(entrada, [{ measured: [100, 200, 100], canonical: [200, 100, 50] }])
    const [r1, g1] = px(out, 0)
    const [r2, g2] = px(out, 1)
    expect(r2).toBeLessThan(r1)
    expect(g2).toBeLessThan(g1)
    expect(Math.round((r2 / r1) * 100)).toBe(50)
  })

  it('classifica cada pixel pelo material mais próximo', () => {
    const entrada = img([[110, 190, 105], [60, 55, 190]])
    const out = harmonize(entrada, [
      { measured: [100, 200, 100], canonical: [0, 255, 0] },
      { measured: [50, 50, 200], canonical: [255, 0, 0] },
    ])
    // o primeiro pixel é verde-ish → puxado para o verde canônico
    expect(px(out, 0)[1]).toBeGreaterThan(px(out, 0)[0])
    // o segundo é azul-ish → puxado para o vermelho canônico
    expect(px(out, 1)[0]).toBeGreaterThan(px(out, 1)[2])
  })

  it('não altera a imagem de entrada e preserva alfa', () => {
    const entrada: RgbaImage = { width: 1, height: 1, data: new Uint8Array([100, 200, 100, 128]) }
    const copia = new Uint8Array(entrada.data)
    const out = harmonize(entrada, [{ measured: [100, 200, 100], canonical: [10, 20, 10] }])
    expect([...entrada.data]).toEqual([...copia])
    expect(out.data[3]).toBe(128)
  })

  it('sem materiais devolve cópia igual', () => {
    const entrada = img([[1, 2, 3]])
    const out = harmonize(entrada, [])
    expect([...out.data]).toEqual([...entrada.data])
    expect(out.data).not.toBe(entrada.data)
  })
})
