import { describe, expect, it } from 'vitest'
import { posicaoNoMapa } from '../../../src/ui/screens/areas/mapa.js'

const regiao = { width: 96, height: 72 } as const

describe('onde o marcador da área fica no mapa', () => {
  it('converte a âncora em tiles para porcentagem da imagem', () => {
    // Âncora no centro da primeira área de 24×36: tile (12, 18) de uma região 96×72.
    expect(posicaoNoMapa(regiao, { x: 12, y: 18 })).toEqual({ esquerda: 12.5, topo: 25 })
  })

  it('o canto superior esquerdo é 0 % e o inferior direito é 100 %', () => {
    expect(posicaoNoMapa(regiao, { x: 0, y: 0 })).toEqual({ esquerda: 0, topo: 0 })
    expect(posicaoNoMapa(regiao, { x: 96, y: 72 })).toEqual({ esquerda: 100, topo: 100 })
  })

  it('região de tamanho zero não divide por zero: devolve o canto', () => {
    // Dado ruim não pode virar `NaN%`, que o navegador ignora e empilha tudo no canto sem aviso.
    expect(posicaoNoMapa({ width: 0, height: 0 }, { x: 5, y: 5 })).toEqual({ esquerda: 0, topo: 0 })
  })

  it('âncora fora dos limites é presa à borda, em vez de sair da imagem', () => {
    expect(posicaoNoMapa(regiao, { x: 200, y: -10 })).toEqual({ esquerda: 100, topo: 0 })
  })
})
