import { describe, expect, it } from 'vitest'
import type { RgbaImage } from '../src/compose.js'
import { removeFlatBackground, trimTransparent } from '../src/background.js'

const FUNDO: [number, number, number] = [200, 200, 200]
const OBJ: [number, number, number] = [20, 120, 40]

/** Constrói uma imagem a partir de um desenho em texto: '.' é fundo, '#' é objeto. */
function draw(linhas: string[]): RgbaImage {
  const height = linhas.length
  const width = linhas[0]!.length
  const data = new Uint8Array(width * height * 4)
  linhas.forEach((linha, y) => {
    [...linha].forEach((c, x) => {
      const cor = c === '#' ? OBJ : FUNDO
      const i = (y * width + x) * 4
      data[i] = cor[0]; data[i + 1] = cor[1]; data[i + 2] = cor[2]; data[i + 3] = 255
    })
  })
  return { width, height, data }
}
const alpha = (img: RgbaImage, x: number, y: number): number => img.data[(y * img.width + x) * 4 + 3]!

describe('removeFlatBackground', () => {
  it('apaga o fundo que encosta na borda e preserva o objeto', () => {
    const img = draw([
      '.....',
      '.###.',
      '.###.',
      '.###.',
      '.....',
    ])
    const out = removeFlatBackground(img)
    expect(alpha(out, 0, 0)).toBe(0)
    expect(alpha(out, 4, 4)).toBe(0)
    expect(alpha(out, 2, 2)).toBe(255)
  })

  it('preserva buraco interno da cor do fundo, porque ele não encosta na borda', () => {
    const img = draw([
      '.....',
      '.###.',
      '.#.#.',
      '.###.',
      '.....',
    ])
    const out = removeFlatBackground(img)
    // o pixel do meio é da cor do fundo, mas está cercado pelo objeto
    expect(alpha(out, 2, 2)).toBe(255)
    expect(alpha(out, 0, 2)).toBe(0)
  })

  it('tolerância decide se um tom próximo conta como fundo', () => {
    const img = draw(['...', '.#.', '...'])
    const i = (1 * 3 + 0) * 4
    img.data[i] = 195; img.data[i + 1] = 195; img.data[i + 2] = 195
    expect(alpha(removeFlatBackground(img, 0), 0, 1)).toBe(255)
    expect(alpha(removeFlatBackground(img, 20), 0, 1)).toBe(0)
  })

  it('não altera a imagem de entrada', () => {
    const img = draw(['..', '.#'])
    const copia = new Uint8Array(img.data)
    removeFlatBackground(img)
    expect([...img.data]).toEqual([...copia])
  })

  it('imagem toda preenchida pelo objeto sai inalterada', () => {
    const img = draw(['##', '##'])
    const out = removeFlatBackground(img)
    expect(alpha(out, 0, 0)).toBe(255)
  })
})

describe('trimTransparent', () => {
  it('apara a borda transparente e centraliza no tamanho pedido', () => {
    const img = draw(['.....', '.....', '..#..', '.....', '.....'])
    const sem = removeFlatBackground(img)
    const out = trimTransparent(sem, 3)
    expect([out.width, out.height]).toEqual([3, 3])
    expect(alpha(out, 1, 1)).toBe(255)
  })

  it('imagem totalmente transparente vira uma célula vazia do tamanho pedido', () => {
    // Construída direto, e não por removeFlatBackground: uma imagem 100 % da cor do fundo é
    // indistinguível de uma 100 % do objeto, e a guarda de "quase tudo" preserva os pixels.
    const img: RgbaImage = { width: 2, height: 2, data: new Uint8Array(2 * 2 * 4) }
    const out = trimTransparent(img, 4)
    expect([out.width, out.height]).toEqual([4, 4])
    expect(out.data.every((v) => v === 0)).toBe(true)
  })
})
