import { describe, expect, it } from 'vitest'
import type { Catalog } from '../src/catalog.js'
import { renderContactSheet } from '../src/contact-sheet.js'

const catalog: Catalog = {
  version: 860,
  sprSignature: 1,
  datSignature: 2,
  outfits: [
    { id: 10, width: 2, height: 2, directions: 4, phases: 3, layers: 1, displacement: { x: 8, y: 8 } },
    { id: 11, width: 1, height: 1, directions: 4, phases: 1, layers: 1, displacement: { x: 0, y: 0 } },
  ],
  items: [
    { id: 100, width: 1, height: 1, patternX: 1, patternY: 1, phases: 1, isGround: true, isBlocking: false },
    { id: 101, width: 1, height: 1, patternX: 1, patternY: 1, phases: 1, isGround: false, isBlocking: true },
  ],
}

describe('renderContactSheet', () => {
  it('lista só outfits multi-tile e itens de chão por padrão', () => {
    const html = renderContactSheet(catalog, { onlyMultiTileOutfits: true, groundItemsOnly: true })
    expect(html).toContain('outfits/10/south_0.png')
    expect(html).not.toContain('outfits/11/')
    expect(html).toContain('items/100_0_0.png')
    expect(html).not.toContain('items/101_0_0.png')
    expect(html).toContain('data-id="10"')
  })

  it('lista tudo quando os filtros estão desligados', () => {
    const html = renderContactSheet(catalog, { onlyMultiTileOutfits: false, groundItemsOnly: false })
    expect(html).toContain('outfits/11/south_0.png')
    expect(html).toContain('items/101_0_0.png')
  })
})
