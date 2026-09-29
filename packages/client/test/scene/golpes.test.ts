/**
 * O cliente escolhe a animação pelo TIPO do golpe, e precisa continuar jogável sem ela.
 *
 * As duas metades importam igual: com o atlas, o golpe tem cara; sem ele — instalação com atlas
 * antigo — o combate volta ao desenho genérico em vez de sumir.
 */
import { describe, expect, it } from 'vitest'
import { direcaoDoProjetil, efeitoAnimName, projetilFrameName } from '@pokeidle/shared'
import { golpeDoTipo, type AtlasData, type SpritesheetJson } from '../../src/scene/atlas.js'

const vazia: SpritesheetJson = { frames: {}, animations: {}, meta: { image: 'x.png', size: { w: 0, h: 0 }, scale: '1' } }
const comGolpes: SpritesheetJson = {
  ...vazia,
  meta: { ...vazia.meta, golpes: [{ type: 'fire', projetil: 4, efeito: 6 }, { type: 'normal', efeito: 19 }] },
}

describe('golpeDoTipo', () => {
  it('acha o par declarado para o tipo', () => {
    const atlas: AtlasData = { pokemon: vazia, tiles: vazia, golpes: comGolpes }
    expect(golpeDoTipo(atlas, 'fire')).toEqual({ type: 'fire', projetil: 4, efeito: 6 })
  })

  it('devolve null para tipo não declarado, e não um objeto meio vazio', () => {
    const atlas: AtlasData = { pokemon: vazia, tiles: vazia, golpes: comGolpes }
    expect(golpeDoTipo(atlas, 'water')).toBeNull()
  })

  it('sem o atlas de golpes devolve null: o jogo continua, no desenho genérico', () => {
    const atlas: AtlasData = { pokemon: vazia, tiles: vazia, golpes: null }
    expect(golpeDoTipo(atlas, 'fire')).toBeNull()
  })

  it('tipo sem projétil declarado não inventa um', () => {
    const atlas: AtlasData = { pokemon: vazia, tiles: vazia, golpes: comGolpes }
    expect(golpeDoTipo(atlas, 'normal')?.projetil).toBeUndefined()
  })
})

describe('direção do projétil', () => {
  it('mapeia o deslocamento na célula do padrão 3×3', () => {
    expect(direcaoDoProjetil(5, 0)).toEqual({ px: 2, py: 1 })
    expect(direcaoDoProjetil(-5, 0)).toEqual({ px: 0, py: 1 })
    expect(direcaoDoProjetil(0, -3)).toEqual({ px: 1, py: 0 })
    expect(direcaoDoProjetil(-2, 4)).toEqual({ px: 0, py: 2 })
  })

  it('o nome do quadro junta id e célula, e o da animação só o id', () => {
    expect(projetilFrameName(4, 2, 1)).toBe('projetil-4-21')
    expect(efeitoAnimName(6)).toBe('efeito-6')
  })
})
