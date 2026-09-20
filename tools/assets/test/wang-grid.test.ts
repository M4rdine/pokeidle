import { describe, expect, it } from 'vitest'
import type { RgbaImage } from '../src/compose.js'
import { readWangGrid } from '../src/wang-grid.js'

const A: [number, number, number] = [40, 180, 60]   // "grama"
const B: [number, number, number] = [150, 100, 60]  // "terra"

/** Pinta uma célula de 32×32 com um material por quadrante, na ordem TL, TR, BL, BR. */
function cell(tl: [number, number, number], tr: [number, number, number], bl: [number, number, number], br: [number, number, number]): number[][] {
  const linhas: number[][] = []
  for (let y = 0; y < 32; y++) {
    const linha: number[] = []
    for (let x = 0; x < 32; x++) {
      const c = y < 16 ? (x < 16 ? tl : tr) : (x < 16 ? bl : br)
      linha.push(c[0], c[1], c[2], 255)
    }
    linhas.push(linha)
  }
  return linhas
}

/** Monta uma grade de células numa imagem, em ordem de leitura. */
function grid(cells: number[][][], cols: number): RgbaImage {
  const rows = Math.ceil(cells.length / cols)
  const width = cols * 32
  const height = rows * 32
  const data = new Uint8Array(width * height * 4)
  cells.forEach((c, i) => {
    const ox = (i % cols) * 32
    const oy = Math.floor(i / cols) * 32
    for (let y = 0; y < 32; y++) {
      const linha = c[y]!
      for (let x = 0; x < 32; x++) {
        const di = ((oy + y) * width + ox + x) * 4
        data.set(linha.slice(x * 4, x * 4 + 4), di)
      }
    }
  })
  return { width, height, data }
}

describe('readWangGrid', () => {
  it('deduz o código de canto de cada célula amostrando os quadrantes', () => {
    const puroA = cell(A, A, A, A)
    const puroB = cell(B, B, B, B)
    // A só no canto superior direito: ordem do código é TR, BR, BL, TL
    const soTR = cell(B, A, B, B)
    // Duas células puras de A contra uma de B: A vira o material "from", que é o caso real —
    // no conjunto gerado o material de fundo aparece em mais células puras.
    const imagem = grid([puroA, puroA, soTR, puroB], 2)
    const r = readWangGrid(imagem, { from: 'grama', to: 'terra' })
    expect(r.pieces.get('aaaa')).toBeDefined()   // tudo "from"
    expect(r.pieces.get('bbbb')).toBeDefined()   // tudo "to"
    expect(r.pieces.get('abbb')).toBeDefined()   // só TR é "from"
  })

  it('escolhe como material "from" o que ocupa mais células puras', () => {
    const puroA = cell(A, A, A, A)
    const puroB = cell(B, B, B, B)
    const imagem = grid([puroA, puroA, puroA, puroB], 2)
    const r = readWangGrid(imagem, { from: 'grama', to: 'terra' })
    // três células puras de A contra uma de B: A é o "from"
    const aaaa = r.pieces.get('aaaa')!
    expect(aaaa.data[0]).toBe(A[0])
  })

  it('relata quais dos dezesseis códigos ficaram faltando', () => {
    const imagem = grid([cell(A, A, A, A), cell(B, B, B, B)], 2)
    const r = readWangGrid(imagem, { from: 'grama', to: 'terra' })
    expect(r.missing).toHaveLength(14)
    expect(r.missing).not.toContain('aaaa')
    expect(r.missing).not.toContain('bbbb')
  })

  it('recusa imagem que não fecha em células de 32', () => {
    const quebrada: RgbaImage = { width: 40, height: 32, data: new Uint8Array(40 * 32 * 4) }
    expect(() => readWangGrid(quebrada, { from: 'a', to: 'b' })).toThrow(/múltiplo de 32/)
  })

  it('recusa conjunto com menos de dois materiais distintos', () => {
    const imagem = grid([cell(A, A, A, A), cell(A, A, A, A)], 2)
    expect(() => readWangGrid(imagem, { from: 'a', to: 'b' })).toThrow(/dois materiais/)
  })
  it('swap inverte qual material é a base, para corrigir conjunto que saiu ao contrário', () => {
    const puroA = cell(A, A, A, A)
    const puroB = cell(B, B, B, B)
    const imagem = grid([puroA, puroA, cell(B, A, B, B), puroB], 2)
    const normal = readWangGrid(imagem, { from: 'grama', to: 'terra' })
    const trocado = readWangGrid(imagem, { from: 'terra', to: 'grama', swap: true })
    expect(normal.fromColor).toEqual(trocado.toColor)
    expect(normal.toColor).toEqual(trocado.fromColor)
    // a peça que era "só TR do material base" vira o complemento dela
    expect(trocado.pieces.get('baaa')).toBeDefined()
  })
})
