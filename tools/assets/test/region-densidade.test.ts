import { describe, expect, it } from 'vitest'
import { desenharRegiao, GRADE } from '../src/region-draw.js'
import { regiaoPorId } from '../src/regioes.js'

const todos = (): boolean => true
const kanto = regiaoPorId('kanto')!

const LADO_QUADRANTE = 12

/** Quantos props caíram em cada quadrante da área do bioma. */
function contagemPorQuadrante(id: string, detail: readonly (string | null)[]): number[] {
  const indice = kanto.biomas.findIndex((b) => b.id === id)
  if (indice < 0) throw new Error(`bioma ${id} não existe`)
  const porLinha = Math.floor(GRADE.width / GRADE.areaWidth)
  const ax = (indice % porLinha) * GRADE.areaWidth
  const ay = Math.floor(indice / porLinha) * GRADE.areaHeight
  const colunas = GRADE.areaWidth / LADO_QUADRANTE
  const contagem = new Array<number>((GRADE.areaHeight / LADO_QUADRANTE) * colunas).fill(0)
  for (let y = 0; y < GRADE.areaHeight; y++) {
    for (let x = 0; x < GRADE.areaWidth; x++) {
      if (detail[(ay + y) * GRADE.width + ax + x] === null) continue
      const q = Math.floor(y / LADO_QUADRANTE) * colunas + Math.floor(x / LADO_QUADRANTE)
      contagem[q] = contagem[q]! + 1
    }
  }
  return contagem
}

const media = (ns: readonly number[]): number => ns.reduce((t, n) => t + n, 0) / ns.length
const variancia = (ns: readonly number[]): number => {
  const m = media(ns)
  return ns.reduce((t, n) => t + (n - m) ** 2, 0) / ns.length
}

describe('campo de densidade dos props', () => {
  it('props se agrupam: a dispersão fica bem acima da de um espalhamento uniforme', () => {
    const { detail } = desenharRegiao(kanto, todos)
    const contagem = contagemPorQuadrante('bosque-denso', detail)
    const m = media(contagem)
    expect(m, 'o bosque precisa ter props para a medida valer').toBeGreaterThan(4)
    // Num espalhamento uniforme a contagem é de Poisson, e variância ≈ média. Agrupamento
    // empurra a razão para cima: é o índice de dispersão, e é o que separa bosque de confete.
    expect(variancia(contagem) / m).toBeGreaterThan(2)
  })

  it('o campo redistribui sem mudar o total: a floresta não some nem dobra', () => {
    const { detail } = desenharRegiao(kanto, todos)
    const total = media(contagemPorQuadrante('bosque-denso', detail)) * 6
    // As densidades do bosque somam ~0,085 sobre 24×36 células, e árvore ocupa 2×2. A faixa é
    // larga de propósito: o teste guarda contra sumiço e explosão, não contra variação honesta.
    expect(total).toBeGreaterThan(40)
    expect(total).toBeLessThan(220)
  })
})
