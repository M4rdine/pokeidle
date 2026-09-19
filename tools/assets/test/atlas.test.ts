import { describe, expect, it } from 'vitest'
import { packGrid, toTiledTileset, type AtlasFrame } from '../src/atlas.js'
import type { RgbaImage } from '../src/compose.js'

function solid(w: number, h: number, v: number): RgbaImage {
  return { width: w, height: h, data: new Uint8Array(w * h * 4).fill(v) }
}

function px(img: RgbaImage, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4]!
}

function solidFrame(name: string, value: number): AtlasFrame {
  return { name, image: { width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(value) } }
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

  it('usa as animações passadas em vez de agrupar por sufixo', () => {
    const { sheet } = packGrid(
      [
        { name: 'water', image: solid(32, 32, 1) },
        { name: 'water_1', image: solid(32, 32, 2) },
      ],
      'tiles.png',
      0,
      { water: ['water', 'water_1'] },
    )
    expect(sheet.animations).toEqual({ water: ['water', 'water_1'] })
  })

  it('o tileset aceita uma ordem que cobre só parte dos frames', () => {
    const { sheet } = packGrid(
      [
        { name: 'water', image: solid(32, 32, 1) },
        { name: 'water_1', image: solid(32, 32, 2) },
      ],
      'tiles.png',
      0,
    )
    const tileset = toTiledTileset(sheet, 'tibia-tiles', ['water'])
    // tilecount conta a grade inteira da imagem, como o Tiled faz; só `tiles` é que fica com os
    // nomes do subconjunto, e o quadro de fase entra na grade sem nome nenhum.
    expect(tileset.tilecount).toBe(2)
    expect(tileset.tiles).toEqual([{ id: 0, properties: [{ name: 'name', type: 'string', value: 'water' }] }])
  })

  it('o tileset recusa nome fora do spritesheet e nome repetido', () => {
    const { sheet } = packGrid([{ name: 'grass', image: solid(32, 32, 1) }], 'tiles.png', 0)
    expect(() => toTiledTileset(sheet, 'x', ['grass', 'sumiu'])).toThrow(/fora do spritesheet: sumiu/)
    expect(() => toTiledTileset(sheet, 'x', ['grass', 'grass'])).toThrow(/nome repetido/)
  })

  it('numera cada tile pela posição dele na grade da imagem, não pela posição na ordem', () => {
    // o Tiled deriva o id de um tileset de imagem pela célula da grade, contando TODA célula,
    // inclusive os quadros de fase que não entram na ordem. Numerar pela ordem gruda o nome no
    // tile errado a partir do primeiro animado, e o mapa desenhado importa trocado.
    const frames: AtlasFrame[] = [
      { name: 'water', image: solid(32, 32, 1) },
      { name: 'water_1', image: solid(32, 32, 2) },
      { name: 'water_2', image: solid(32, 32, 3) },
      { name: 'grass', image: solid(32, 32, 4) },
    ]
    const { sheet } = packGrid(frames, 'tiles.png', 0)
    const tileset = toTiledTileset(sheet, 'tibia-tiles', ['water', 'grass'])
    const idOf = (name: string): number =>
      tileset.tiles.find((t) => t.properties[0]!.value === name)!.id
    expect(idOf('water')).toBe(0)
    expect(idOf('grass')).toBe(3)
  })

  it('o terreno aponta para o id de grade do tile, não para a posição na ordem', () => {
    const frames: AtlasFrame[] = [
      { name: 'water', image: solid(32, 32, 1) },
      { name: 'water_1', image: solid(32, 32, 2) },
      { name: 'water_2', image: solid(32, 32, 3) },
      { name: 'grass', image: solid(32, 32, 4) },
    ]
    const { sheet } = packGrid(frames, 'tiles.png', 0)
    const tileset = toTiledTileset(sheet, 'tibia-tiles', ['water', 'grass'], [
      { name: 'praia', colors: ['water', 'grass'], tiles: [{ tile: 'grass', corners: ['grass', 'grass', 'grass', 'grass'] }] },
    ])
    expect(tileset.wangsets![0]!.wangtiles[0]!.tileid).toBe(3)
  })

  it('rejeita ordem com tamanho ou nomes diferentes do spritesheet', () => {
    const { sheet } = packGrid([{ name: 'grass', image: solid(32, 32, 1) }], 'tiles.png', 0)
    expect(() => toTiledTileset(sheet, 'x', [])).toThrow(/ordem de frames/)
    expect(() => toTiledTileset(sheet, 'x', ['water'])).toThrow(/ordem de frames/)
  })

  it('escreve os terrenos como wangsets no formato do Tiled', () => {
    const frames = [solidFrame('grass', 1), solidFrame('dirt', 2), solidFrame('grass-dirt-ne', 3)]
    const packed = packGrid(frames, 'tiles.png')
    const order = frames.map((f) => f.name)
    const tileset = toTiledTileset(packed.sheet, 'tibia-tiles', order, [{
      name: 'grama-terra',
      colors: ['grama', 'terra'],
      tiles: [
        { tile: 'grass', corners: ['grama', 'grama', 'grama', 'grama'] },
        { tile: 'dirt', corners: ['terra', 'terra', 'terra', 'terra'] },
        { tile: 'grass-dirt-ne', corners: ['terra', 'grama', 'grama', 'grama'] },
      ],
    }])
    const wangset = tileset.wangsets?.[0]
    expect(wangset).toMatchObject({ name: 'grama-terra', type: 'corner', tile: -1 })
    expect(wangset?.colors.map((c) => c.name)).toEqual(['grama', 'terra'])
    // wangid: [topo, topo-direita, direita, baixo-direita, baixo, baixo-esquerda, esquerda, topo-esquerda]
    expect(wangset?.wangtiles).toEqual([
      { tileid: 0, wangid: [0, 1, 0, 1, 0, 1, 0, 1] },
      { tileid: 1, wangid: [0, 2, 0, 2, 0, 2, 0, 2] },
      { tileid: 2, wangid: [0, 2, 0, 1, 0, 1, 0, 1] },
    ])
  })

  it('recusa terreno citando tile fora do tileset', () => {
    const frames = [solidFrame('grass', 1)]
    const packed = packGrid(frames, 'tiles.png')
    expect(() => toTiledTileset(packed.sheet, 'tibia-tiles', ['grass'], [{
      name: 'x', colors: ['grama'], tiles: [{ tile: 'sumiu', corners: ['grama', 'grama', 'grama', 'grama'] }],
    }])).toThrow(/sumiu/)
  })
})
