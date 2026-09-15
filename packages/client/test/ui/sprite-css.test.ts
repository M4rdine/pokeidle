import { describe, expect, it } from 'vitest'
import type { AtlasData, SpritesheetJson } from '../../src/scene/atlas.js'
import { applySpriteStyle, spriteStyle } from '../../src/ui/sprite-css.js'

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
    const node = document.createElement('div')
    applySpriteStyle(node, atlas, 'charmander')
    expect(node.style.getPropertyValue('background-position')).toBe('-64px 0px')
    expect(node.style.getPropertyValue('width')).toBe('32px')
    const unknown = document.createElement('div')
    applySpriteStyle(unknown, atlas, 'mewtwo')
    expect(unknown.classList.contains('sprite-unknown')).toBe(true)
  })
})
