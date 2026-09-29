/**
 * A triagem de terreno não precisa ser perfeita — precisa não confundir bioma com bioma, que é o
 * erro que faria o localizador oferecer uma caverna para a Praia Longa.
 */
import { describe, expect, it } from 'vitest'
import { atende, classeDaCor, composicao } from '../src/terrenos.js'

describe('classeDaCor', () => {
  it('lê os quatro biomas pelo que a cor tem de mais forte', () => {
    expect(classeDaCor([60, 140, 60])).toBe('grama')
    expect(classeDaCor([60, 90, 180])).toBe('agua')
    expect(classeDaCor([215, 200, 130])).toBe('areia')
    expect(classeDaCor([150, 110, 70])).toBe('terra')
  })

  it('decide pedra pela FALTA de cor, não pelo tom — rocha vai de clara a escura', () => {
    expect(classeDaCor([120, 122, 125])).toBe('pedra')
    expect(classeDaCor([90, 88, 92])).toBe('pedra')
    expect(classeDaCor([225, 228, 230])).toBe('neve')
  })

  it('chama de escuro o que não tem luz para ter tema', () => {
    expect(classeDaCor([20, 18, 25])).toBe('escuro')
  })

  it('sem desenho não inventa classe', () => {
    expect(classeDaCor(null)).toBeNull()
  })
})

describe('composição e exigência', () => {
  const comp = composicao(['grama', 'grama', 'grama', 'agua', null])

  it('mede a fração de cada classe sobre o total, contando o que não tem classe', () => {
    expect(comp['grama']).toBeCloseTo(0.6, 5)
    expect(comp['agua']).toBeCloseTo(0.2, 5)
  })

  it('aprova quando toda faixa pedida é atendida', () => {
    expect(atende(comp, { grama: [0.5, 1], agua: [0.1, 0.3] })).toBe(true)
  })

  it('reprova a classe que falta, e não só a que sobra', () => {
    expect(atende(comp, { areia: [0.2, 1] })).toBe(false)
    expect(atende(comp, { grama: [0, 0.4] })).toBe(false)
  })
})
