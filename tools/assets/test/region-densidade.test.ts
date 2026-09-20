import { describe, expect, it } from 'vitest'
import { desenharRegiao, GRADE } from '../src/region-draw.js'
import { regiaoPorId } from '../src/regioes.js'

const todos = (): boolean => true
const kanto = regiaoPorId('kanto')!

const LADO_QUADRANTE = 12
const QUADRANTES = (GRADE.areaWidth / LADO_QUADRANTE) * (GRADE.areaHeight / LADO_QUADRANTE)

interface PorQuadrante { readonly props: number[]; readonly elegiveis: number[] }

/**
 * Props e células elegíveis por quadrante da área.
 *
 * Contar só os props não serve: grama alta, trilha e prédios ocupam células, e um prop só nasce
 * em material primário livre. Sem dividir pela oferta, o teste mediria o recorte do mapa junto
 * com o campo de densidade, e não saberia dizer qual dos dois mudou.
 */
function porQuadrante(id: string): PorQuadrante {
  const draft = desenharRegiao(kanto, todos)
  const indice = kanto.biomas.findIndex((b) => b.id === id)
  if (indice < 0) throw new Error(`bioma ${id} não existe`)
  const porLinha = Math.floor(GRADE.width / GRADE.areaWidth)
  const ax = (indice % porLinha) * GRADE.areaWidth
  const ay = Math.floor(indice / porLinha) * GRADE.areaHeight
  const props = new Array<number>(QUADRANTES).fill(0)
  const elegiveis = new Array<number>(QUADRANTES).fill(0)
  for (let y = 0; y < GRADE.areaHeight; y++) {
    for (let x = 0; x < GRADE.areaWidth; x++) {
      const i = (ay + y) * GRADE.width + ax + x
      const q = Math.floor(y / LADO_QUADRANTE) * (GRADE.areaWidth / LADO_QUADRANTE) + Math.floor(x / LADO_QUADRANTE)
      if (draft.detail[i] !== null) props[q] = props[q]! + 1
      if (draft.ground[i]!.includes('-aaaa') && draft.blocked[i] !== true) elegiveis[q] = elegiveis[q]! + 1
    }
  }
  return { props, elegiveis }
}

describe('campo de densidade dos props', () => {
  it('props se agrupam: a taxa por célula disponível varia muito de canto a canto', () => {
    const { props, elegiveis } = porQuadrante('bosque-denso')
    expect(Math.min(...elegiveis), 'todo quadrante precisa ter oferta').toBeGreaterThan(20)
    const taxas = props.map((n, q) => n / elegiveis[q]!)
    // Espalhamento uniforme daria a mesma taxa em todo canto, e a razão ficaria perto de 1.
    // Com campo de densidade um canto vira bosque e outro vira clareira.
    expect(Math.max(...taxas) / Math.max(1e-6, Math.min(...taxas))).toBeGreaterThan(3)
  })

  it('o campo redistribui sem mudar o total: a floresta não some nem dobra', () => {
    const total = porQuadrante('bosque-denso').props.reduce((a, b) => a + b, 0)
    // A faixa é larga de propósito: o teste guarda contra sumiço e explosão, não contra variação
    // honesta — grama alta e trilha disputam as mesmas células e mexem no total.
    expect(total).toBeGreaterThan(25)
    expect(total).toBeLessThan(220)
  })
})
