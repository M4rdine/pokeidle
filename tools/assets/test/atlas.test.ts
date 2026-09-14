import { describe, expect, it } from 'vitest'
import { packGrid, toTiledTileset, type AtlasFrame } from '../src/atlas.js'
import type { RgbaImage } from '../src/compose.js'

function solid(w: number, h: number, v: number): RgbaImage {
  return { width: w, height: h, data: new Uint8Array(w * h * 4).fill(v) }
}

function px(img: RgbaImage, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4]!
}

describe('packGrid', () => {
  const frames: AtlasFrame[] = [
    { name: 'a/walk_south_0', image: solid(2, 2, 10) },
    { name: 'a/walk_south_1', image: solid(2, 2, 20) },
    { name: 'a/walk_north_0', image: solid(2, 2, 30) },
    { name: 'grass', image: solid(1, 1, 40) },
    { name: 'water', image: solid(2, 2, 50) },
  ]
  const { image, sheet } = packGrid(frames, 'sheet.png', 0)

  it('usa ceil(sqrt(n)) colunas e a maior célula', () => {
    expect(sheet.meta.columns).toBe(3)
    expect(sheet.meta.cell).toEqual({ w: 2, h: 2 })
    expect(image.width).toBe(6)
    expect(image.height).toBe(4)
    expect(sheet.meta).toMatchObject({ image: 'sheet.png', size: { w: 6, h: 4 }, format: 'RGBA8888', scale: '1' })
  })

  it('posiciona frames em ordem, linha por linha', () => {
    expect(sheet.frames['a/walk_south_1']?.frame).toEqual({ x: 2, y: 0, w: 2, h: 2 })
    expect(sheet.frames['grass']?.frame).toEqual({ x: 0, y: 2, w: 1, h: 1 })
    expect(px(image, 2, 0)).toBe(20)
    expect(px(image, 0, 2)).toBe(40)
    expect(px(image, 1, 2)).toBe(0) // resto da célula do grass fica transparente
  })

  it('agrupa animações pelo prefixo antes de _<n>', () => {
    expect(sheet.animations).toEqual({
      'a/walk_south': ['a/walk_south_0', 'a/walk_south_1'],
      'a/walk_north': ['a/walk_north_0'],
    })
  })

  it('aplica padding entre células', () => {
    const packed = packGrid(frames.slice(0, 2), 'p.png', 1)
    expect(packed.image.width).toBe(2 * 2 + 1)
    expect(packed.sheet.frames['a/walk_south_1']?.frame.x).toBe(3)
  })

  it('lança erro para lista vazia', () => {
    expect(() => packGrid([], 'x.png')).toThrow(/nenhum frame/)
  })
})

describe('toTiledTileset', () => {
  it('gera tileset com ids locais na ordem informada e nome como propriedade', () => {
    const { sheet } = packGrid(
      [
        { name: 'grass', image: solid(32, 32, 1) },
        { name: 'water', image: solid(32, 32, 2) },
      ],
      'tiles.png',
      0,
    )
    const ts = toTiledTileset(sheet, 'tibia-tiles', ['grass', 'water'])
    expect(ts).toMatchObject({ type: 'tileset', image: 'tiles.png', tilewidth: 32, tileheight: 32, tilecount: 2, columns: 2, spacing: 0 })
    expect(ts.tiles[1]).toEqual({ id: 1, properties: [{ name: 'name', type: 'string', value: 'water' }] })
  })

  it('respeita a ordem mesmo com nome numérico, que o JS hoista nas chaves do objeto', () => {
    const { sheet } = packGrid(
      [
        { name: 'grass', image: solid(32, 32, 1) },
        { name: '42', image: solid(32, 32, 2) },
        { name: 'water', image: solid(32, 32, 3) },
      ],
      'tiles.png',
      0,
    )
    expect(Object.keys(sheet.frames)[0]).toBe('42') // ordem das chaves não serve como ordem dos tiles
    const ts = toTiledTileset(sheet, 'tibia-tiles', ['grass', '42', 'water'])
    expect(ts.tiles.map((t) => [t.id, t.properties[0]!.value])).toEqual([
      [0, 'grass'],
      [1, '42'],
      [2, 'water'],
    ])
  })

  it('rejeita ordem com tamanho ou nomes diferentes do spritesheet', () => {
    const { sheet } = packGrid([{ name: 'grass', image: solid(32, 32, 1) }], 'tiles.png', 0)
    expect(() => toTiledTileset(sheet, 'x', [])).toThrow(/ordem de frames/)
    expect(() => toTiledTileset(sheet, 'x', ['water'])).toThrow(/ordem de frames/)
  })
})
