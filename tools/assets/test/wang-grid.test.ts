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

  it('relata quais dos dezesseis códigos o gerador não entregou', () => {
    const imagem = grid([cell(A, A, A, A), cell(B, B, B, B)], 2)
    const r = readWangGrid(imagem, { from: 'grama', to: 'terra' })
    // As catorze mistas foram compostas; as duas puras vieram da folha.
    expect(r.synthesized).toHaveLength(14)
    expect(r.synthesized).not.toContain('aaaa')
    expect(r.synthesized).not.toContain('bbbb')
    expect(r.pieces.size).toBe(16)
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
  it('guarda todas as células que produziram o mesmo código, como variação', () => {
    const puroA = cell(A, A, A, A)
    const imagem = grid([puroA, puroA, puroA, cell(B, B, B, B)], 2)
    const r = readWangGrid(imagem, { from: 'grama', to: 'terra' })
    expect(r.variants.get('aaaa')).toHaveLength(3)
    expect(r.variants.get('bbbb')).toHaveLength(1)
    expect(r.pieces.get('aaaa')).toBe(r.variants.get('aaaa')![0])
  })
})

describe('folha incompleta', () => {
  /** Cor média de um quadrante da peça, para dizer que material caiu ali. */
  const quadrante = (img: RgbaImage, direita: boolean, baixo: boolean): [number, number, number] => {
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let y = baixo ? 20 : 4; y < (baixo ? 28 : 12); y++) {
      for (let x = direita ? 20 : 4; x < (direita ? 28 : 12); x++) {
        const i = (y * img.width + x) * 4
        r += img.data[i]!
        g += img.data[i + 1]!
        b += img.data[i + 2]!
        n += 1
      }
    }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
  }
  const perto = (c: [number, number, number], alvo: [number, number, number]): boolean =>
    (c[0] - alvo[0]) ** 2 + (c[1] - alvo[1]) ** 2 + (c[2] - alvo[2]) ** 2 < 900

  it('completa as combinações que o gerador não entregou, a partir das peças puras', () => {
    // O gerador de tileset raramente devolve os códigos em xadrez; sem completar, um conjunto
    // bom inteiro era recusado por causa de cinco peças.
    const puroA = cell(A, A, A, A)
    const puroB = cell(B, B, B, B)
    const img = grid([puroA, puroB, cell(A, B, A, A), cell(B, A, A, A)], 2)

    const grade = readWangGrid(img, { from: 'campo', to: 'alta' })

    expect(grade.synthesized).toContain('baba')
    expect(grade.pieces.size).toBe(16)
    // 'baba' é topRight=b, bottomRight=a, bottomLeft=b, topLeft=a: o xadrez que faltava.
    const peca = grade.pieces.get('baba')!
    expect(perto(quadrante(peca, false, false), A), 'superior-esquerdo').toBe(true)
    expect(perto(quadrante(peca, true, false), B), 'superior-direito').toBe(true)
    expect(perto(quadrante(peca, false, true), B), 'inferior-esquerdo').toBe(true)
    expect(perto(quadrante(peca, true, true), A), 'inferior-direito').toBe(true)
  })

  it('sem peça pura dos dois lados não há do que compor, e o erro continua', () => {
    const img = grid([cell(A, A, A, A), cell(A, B, A, A)], 2)
    expect(() => readWangGrid(img, { from: 'campo', to: 'alta' })).toThrow(/dois materiais distintos/)
  })
})
