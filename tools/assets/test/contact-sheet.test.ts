import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { packGrid } from '../src/atlas.js'
import type { Catalog } from '../src/catalog.js'
import { renderContactSheet, renderTilesetSheet, writeContactSheet } from '../src/contact-sheet.js'

const catalog: Catalog = {
  version: 860,
  extended: false,
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

describe('renderTilesetSheet', () => {
  it('desenha uma célula por tile do atlas, com o nome', () => {
    const packed = packGrid([
      { name: 'grass', image: { width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(60) } },
      { name: 'pokecenter-x0-y0', image: { width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(90) } },
    ], 'tiles.png')
    const html = renderTilesetSheet(packed.sheet)
    expect(html).toContain('grass')
    expect(html).toContain('pokecenter-x0-y0')
    expect(html.match(/<figure/g)).toHaveLength(2)
    // cada célula recorta o atlas pela posição do frame
    expect(html).toContain('background-position:-32px 0px')
    expect(html).toContain('url(tiles.png)')
  })
})

describe('writeContactSheet', () => {
  it('escreve index.html ao lado do catalog.json e devolve o caminho', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-sheet-'))
    await writeFile(join(dir, 'catalog.json'), JSON.stringify(catalog))

    const path = await writeContactSheet(dir, { onlyMultiTileOutfits: true, groundItemsOnly: true })

    expect(path).toBe(join(dir, 'index.html'))
    expect(await readFile(path, 'utf8')).toContain('outfits/10/south_0.png')
  })
})
