import { describe, expect, it } from 'vitest'
import type { HuntMap } from '@pokeidle/shared'
import { packGrid, type AtlasFrame } from '../src/atlas.js'
import type { RgbaImage } from '../src/compose.js'
import { renderMapPreview } from '../src/map-preview.js'

const solid = (value: number): RgbaImage => ({ width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(value) })
const frames: AtlasFrame[] = [
  { name: 'grass', image: solid(60) },
  { name: 'tree', image: solid(120) },
]
const atlas = (() => {
  const packed = packGrid(frames, 'tiles.png')
  return { sheet: packed.sheet, image: packed.image }
})()

const map: HuntMap = {
  id: 'teste', name: 'Teste', width: 2, height: 1, tileSize: 32,
  layers: { ground: ['grass', 'grass'], detail: [null, 'tree'], blocking: [false, true] },
  spawnPoint: { x: 0, y: 0 }, pokecenter: { x: 1, y: 0 },
  spawns: [{ speciesName: 'zubat', minLevel: 2, maxLevel: 3, x: 0, y: 0, radius: 1, count: 1, respawnSeconds: 10 }],
}
const pixelAt = (img: RgbaImage, x: number, y: number): [number, number, number] => {
  const i = (y * img.width + x) * 4
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!]
}

describe('renderMapPreview', () => {
  it('desenha o mapa no tamanho certo, com o detalhe por cima do chão', () => {
    const preview = renderMapPreview(map, atlas)
    expect([preview.width, preview.height]).toEqual([64, 32])
    expect(pixelAt(preview, 5, 5)).toEqual([60, 60, 60]) // só chão
    expect(pixelAt(preview, 37, 5)).toEqual([120, 120, 120]) // detalhe cobre o chão
  })
  it('com blocking, tinge de vermelho só os tiles bloqueados', () => {
    const plain = renderMapPreview(map, atlas)
    const marked = renderMapPreview(map, atlas, { blocking: true })
    expect(pixelAt(marked, 5, 5)).toEqual(pixelAt(plain, 5, 5))
    const [r, g, b] = pixelAt(marked, 37, 5)
    expect(r).toBeGreaterThan(pixelAt(plain, 37, 5)[0]!)
    expect(g).toBeLessThan(r)
    expect(b).toBeLessThan(r)
  })
  it('tile que não está no atlas vira erro com o nome dele', () => {
    const broken = { ...map, layers: { ...map.layers, ground: ['grass', 'sumiu'] } }
    expect(() => renderMapPreview(broken as HuntMap, atlas)).toThrow(/sumiu/)
  })
  it('pixel transparente do detalhe deixa o chão aparecer embaixo', () => {
    const halfTransparent: RgbaImage = { width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(120) }
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 16; x++) halfTransparent.data[(y * 32 + x) * 4 + 3] = 0
    }
    const punchedFrames: AtlasFrame[] = [{ name: 'grass', image: solid(60) }, { name: 'tree', image: halfTransparent }]
    const punchedPacked = packGrid(punchedFrames, 'tiles.png')
    const punchedAtlas = { sheet: punchedPacked.sheet, image: punchedPacked.image }
    const punchedMap: HuntMap = { ...map, layers: { ...map.layers, detail: [null, 'tree'] } }

    const preview = renderMapPreview(punchedMap, punchedAtlas)

    expect(pixelAt(preview, 37, 5)).toEqual([60, 60, 60]) // pixel transparente do detalhe: chão continua visível
    expect(pixelAt(preview, 50, 5)).toEqual([120, 120, 120]) // pixel opaco do detalhe: cobre o chão normalmente
  })
})
