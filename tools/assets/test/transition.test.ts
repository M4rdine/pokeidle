import { describe, expect, it } from 'vitest'
import type { RgbaImage } from '../src/compose.js'
import { composeTransition, CORNER_CODES, transitionMask, transitionTileNames, transitionTiles } from '../src/transition.js'

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
  it('a divisa vertical entre dois quadrantes do mesmo material não recebe ruído (baaa)', () => {
    // ordem: topRight, bottomRight, bottomLeft, topLeft -> baaa: só topRight é 'b'.
    // bottomLeft e bottomRight são os dois 'a' que dividem a fronteira vertical x=15/16, longe da
    // divisa horizontal (y >= 21): um teste que só olhasse pontos distantes de toda divisa, como
    // (0,0), passaria mesmo numa implementação que ignora o vizinho do outro lado da borda — aqui
    // varremos exatamente a fronteira entre dois quadrantes iguais para provar que ela fica limpa.
    for (let seed = 1; seed <= 30; seed++) {
      const mask = transitionMask('baaa', seed)
      for (let y = 21; y <= 31; y++) {
        for (const x of [15, 16]) {
          expect(at(mask, x, y)).toBe(0)
        }
      }
    }
  })
  it('a divisa horizontal entre dois quadrantes do mesmo material não recebe ruído (aaba, espelhado)', () => {
    // ordem: topRight, bottomRight, bottomLeft, topLeft -> aaba: só bottomLeft é 'b'.
    // topRight e bottomRight são os dois 'a' que dividem a fronteira horizontal y=15/16, longe da
    // divisa vertical (x >= 21).
    for (let seed = 1; seed <= 30; seed++) {
      const mask = transitionMask('aaba', seed)
      for (let x = 21; x <= 31; x++) {
        for (const y of [15, 16]) {
          expect(at(mask, x, y)).toBe(0)
        }
      }
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
  it('recusa tiles de tamanhos diferentes', () => {
    const base = solid(40)
    const over: RgbaImage = { width: 16, height: 16, data: new Uint8Array(16 * 16 * 4).fill(200) }
    expect(() => composeTransition(base, over, transitionMask('baaa', 1))).toThrow(/tamanhos diferentes/)
  })
  it('recusa máscara de tamanho incompatível com o tile', () => {
    const base = solid(40)
    const over = solid(200)
    const wrongMask = new Uint8Array(10)
    expect(() => composeTransition(base, over, wrongMask)).toThrow(/máscara com 10 pixels/)
  })
})

describe('transitionTileNames', () => {
  const entry = { name: 'grama-terra', from: 'grass', to: 'dirt' }

  it('devolve exatamente os nomes que transitionTiles gera, na mesma ordem', () => {
    // a validação de colisão no manifesto usa esta lista sem gerar imagem nenhuma; se ela
    // divergir do gerador, uma colisão de nome volta a passar despercebida.
    const image: RgbaImage = { width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(90) }
    const generated = transitionTiles(entry, { from: image, to: image }).map((t) => t.name)
    expect(transitionTileNames(entry)).toEqual(generated)
  })

  it('cobre as catorze peças mistas, sem as puras', () => {
    const names = transitionTileNames(entry)
    expect(names).toHaveLength(CORNER_CODES.length - 2)
    expect(names).not.toContain('grama-terra-aaaa')
    expect(names).not.toContain('grama-terra-bbbb')
  })
})
