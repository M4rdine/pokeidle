import { describe, expect, it } from 'vitest'
import type { RgbaImage } from '../src/compose.js'
import { composeTransition, CORNER_CODES, transitionMask } from '../src/transition.js'

const solid = (value: number): RgbaImage => ({ width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(value) })
const at = (mask: Uint8Array, x: number, y: number): number => mask[y * 32 + x]!

describe('CORNER_CODES', () => {
  it('cobre as dezesseis combinações de quatro cantos', () => {
    expect(CORNER_CODES).toHaveLength(16)
    expect(new Set(CORNER_CODES).size).toBe(16)
    expect(CORNER_CODES).toContain('aaaa')
    expect(CORNER_CODES).toContain('bbbb')
    expect(CORNER_CODES.every((c) => /^[ab]{4}$/.test(c))).toBe(true)
  })
})

describe('transitionMask', () => {
  it('aaaa é toda transparente e bbbb é toda opaca', () => {
    expect([...transitionMask('aaaa', 1)].every((v) => v === 0)).toBe(true)
    expect([...transitionMask('bbbb', 1)].every((v) => v === 255)).toBe(true)
  })
  it('um canto b cobre o seu quadrante e não o oposto', () => {
    // ordem: superior-direito, inferior-direito, inferior-esquerdo, superior-esquerdo
    const topRight = transitionMask('baaa', 7)
    expect(at(topRight, 28, 3)).toBe(255)
    expect(at(topRight, 3, 28)).toBe(0)
    const bottomLeft = transitionMask('aaba', 7)
    expect(at(bottomLeft, 3, 28)).toBe(255)
    expect(at(bottomLeft, 28, 3)).toBe(0)
  })
  it('é determinística: mesma semente, mesma máscara; sementes diferentes mudam a borda', () => {
    expect([...transitionMask('abab', 3)]).toEqual([...transitionMask('abab', 3)])
    expect([...transitionMask('abab', 3)]).not.toEqual([...transitionMask('abab', 4)])
  })
  it('a borda não é uma linha reta: existe pixel de cada lado da diagonal do quadrante', () => {
    const mask = transitionMask('baaa', 11)
    const edge = [...Array(32).keys()].flatMap((y) => [...Array(32).keys()].map((x) => ({ x, y, v: at(mask, x, y) })))
    const mixedRows = new Set(edge.filter((p) => p.v === 255).map((p) => p.y))
    expect(mixedRows.size).toBeGreaterThan(8) // o recorte acompanha a altura, não um corte único
  })
  it('quadrantes opostos iguais continuam uniformes mesmo com ruído (abab)', () => {
    // ordem: topRight, bottomRight, bottomLeft, topLeft -> abab: topRight=a, bottomRight=b, bottomLeft=a, topLeft=b
    // topLeft (b) e bottomRight (b) são opostos e iguais; topRight (a) e bottomLeft (a) são opostos e iguais.
    for (let seed = 1; seed <= 20; seed++) {
      const mask = transitionMask('abab', seed)
      // canto superior-esquerdo (b) deve ficar inteiramente 255 perto do seu centro mesmo com ruído na borda
      expect(at(mask, 0, 0)).toBe(255)
      // canto superior-direito (a) deve ficar inteiramente 0 perto do seu centro
      expect(at(mask, 31, 0)).toBe(0)
    }
  })
})

describe('composeTransition', () => {
  it('usa o tile de baixo onde a máscara é 0 e o de cima onde é 255', () => {
    const mask = transitionMask('baaa', 5)
    const out = composeTransition(solid(40), solid(200), mask)
    expect([out.width, out.height]).toEqual([32, 32])
    const pixel = (x: number, y: number): number => out.data[(y * 32 + x) * 4]!
    expect(pixel(28, 3)).toBe(200)
    expect(pixel(3, 28)).toBe(40)
  })
  it('não altera as imagens de entrada', () => {
    const base = solid(40)
    const over = solid(200)
    const copy = new Uint8Array(base.data)
    composeTransition(base, over, transitionMask('abab', 2))
    expect([...base.data]).toEqual([...copy])
    expect(over.data.every((v) => v === 200)).toBe(true)
  })
})
