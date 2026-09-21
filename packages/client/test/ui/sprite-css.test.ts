import { describe, expect, it } from 'vitest'
import type { AtlasData, SpritesheetJson } from '../../src/scene/atlas.js'
import { spriteStyle, spriteThumb } from '../../src/ui/sprite-css.js'

const sheet: SpritesheetJson = {
  frames: { 'charmander/walk_south_0': { frame: { x: 64, y: 0, w: 32, h: 32 } } },
  animations: { 'charmander/walk_south': ['charmander/walk_south_0'] },
  meta: { image: 'pokemon.png', size: { w: 128, h: 32 }, scale: '1' },
}
const atlas: AtlasData = { pokemon: sheet, tiles: sheet }

describe('sprite em CSS', () => {
  it('devolve as propriedades do frame walk_south_0', () => {
    expect(spriteStyle(atlas, 'charmander')).toEqual({
      'background-image': 'url(/assets/atlas/pokemon.png)',
      'background-position': '-64px 0px',
      width: '32px',
      height: '32px',
    })
    expect(spriteStyle(atlas, 'mewtwo')).toBeNull()
  })
  it('aplica via CSSOM (a CSP bloqueia atributo style, não a API de estilo)', () => {
    const caixa = spriteThumb(atlas, 'charmander', 32)
    const dentro = caixa.firstElementChild as HTMLElement
    expect(dentro.style.getPropertyValue('background-position')).toBe('-64px 0px')
    // A caixa tem o tamanho pedido e recorta; é ela que impede o sprite de invadir o vizinho.
    expect(caixa.style.getPropertyValue('width')).toBe('32px')
    expect(caixa.classList.contains('sprite-thumb')).toBe(true)
  })

  it('espécie fora do atlas vira marcador, e não caixa vazia', () => {
    const caixa = spriteThumb(atlas, 'mewtwo', 32)
    expect((caixa.firstElementChild as HTMLElement).classList.contains('sprite-unknown')).toBe(true)
  })

  it('escala o frame para caber na caixa, seja ele de 32 ou de 64', () => {
    const dentro = spriteThumb(atlas, 'charmander', 32).firstElementChild as HTMLElement
    // O frame do charmander tem 32 px no atlas de teste: cabe sem reduzir.
    expect(dentro.style.getPropertyValue('transform')).toBe('scale(1)')
    const menor = spriteThumb(atlas, 'charmander', 16).firstElementChild as HTMLElement
    expect(menor.style.getPropertyValue('transform')).toBe('scale(0.5)')
  })
})
