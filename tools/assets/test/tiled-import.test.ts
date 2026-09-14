import { describe, expect, it } from 'vitest'
import type { TiledTileset } from '../src/atlas.js'
import { parseHuntMap } from '../src/hunt-map.js'
import { importTiledMap } from '../src/tiled-import.js'

const tileset: TiledTileset = {
  type: 'tileset',
  version: '1.10',
  name: 'tibia-tiles',
  image: 'tiles.png',
  imagewidth: 64,
  imageheight: 32,
  tilewidth: 32,
  tileheight: 32,
  tilecount: 2,
  columns: 2,
  margin: 0,
  spacing: 0,
  tiles: [
    { id: 0, properties: [{ name: 'name', type: 'string', value: 'grass' }] },
    { id: 1, properties: [{ name: 'name', type: 'string', value: 'mountain' }] },
  ],
}

// mapa 2x2: chão todo grass, montanha no canto inferior direito, bloqueio nesse tile
const tiled = {
  type: 'map',
  orientation: 'orthogonal',
  width: 2,
  height: 2,
  tilewidth: 32,
  tileheight: 32,
  tilesets: [{ firstgid: 1, source: 'tiles.tsj' }],
  layers: [
    { type: 'tilelayer', name: 'ground', width: 2, height: 2, data: [1, 1, 1, 1] },
    { type: 'tilelayer', name: 'detail', width: 2, height: 2, data: [0, 0, 0, 2] },
    { type: 'tilelayer', name: 'blocking', width: 2, height: 2, data: [0, 0, 0, 1] },
    {
      type: 'objectgroup',
      name: 'objects',
      objects: [
        { id: 1, class: 'spawnPoint', x: 0, y: 0, width: 32, height: 32 },
        { id: 2, class: 'pokecenter', x: 32, y: 0, width: 32, height: 32 },
        {
          id: 3,
          class: 'spawn',
          x: 0,
          y: 32,
          width: 64,
          height: 32,
          properties: [
            { name: 'species', type: 'string', value: 'rattata' },
            { name: 'minLevel', type: 'int', value: 2 },
            { name: 'maxLevel', type: 'int', value: 5 },
            { name: 'count', type: 'int', value: 3 },
            { name: 'respawnSeconds', type: 'int', value: 20 },
          ],
        },
      ],
    },
  ],
}

describe('importTiledMap', () => {
  const map = importTiledMap(tiled, tileset, { id: 'route-1', name: 'Rota 1' })

  it('converte camadas de tile em nomes e bloqueio em booleanos', () => {
    expect(map).toMatchObject({ id: 'route-1', name: 'Rota 1', width: 2, height: 2, tileSize: 32 })
    expect(map.layers.ground).toEqual(['grass', 'grass', 'grass', 'grass'])
    expect(map.layers.detail).toEqual([null, null, null, 'mountain'])
    expect(map.layers.blocking).toEqual([false, false, false, true])
  })

  it('converte objetos em posições de tile e spawns', () => {
    expect(map.spawnPoint).toEqual({ x: 0, y: 0 })
    expect(map.pokecenter).toEqual({ x: 1, y: 0 })
    expect(map.spawns).toEqual([
      { speciesName: 'rattata', minLevel: 2, maxLevel: 5, x: 1, y: 1, radius: 1, count: 3, respawnSeconds: 20 },
    ])
  })

  it('o resultado passa no HuntMapSchema', () => {
    expect(() => parseHuntMap(map)).not.toThrow()
  })

  it('falha se faltar spawnPoint ou pokecenter', () => {
    const noObjects = { ...tiled, layers: tiled.layers.slice(0, 3) }
    expect(() => importTiledMap(noObjects, tileset, { id: 'x', name: 'x' })).toThrow(/spawnPoint/)
  })

  it('falha em gid sem nome no tileset', () => {
    const bad = { ...tiled, layers: [{ ...tiled.layers[0]!, data: [1, 1, 1, 9] }, ...tiled.layers.slice(1)] }
    expect(() => importTiledMap(bad, tileset, { id: 'x', name: 'x' })).toThrow(/gid 9/)
  })
})

describe('parseHuntMap', () => {
  it('rejeita camada com tamanho errado', () => {
    const map = importTiledMap(tiled, tileset, { id: 'r', name: 'r' })
    expect(() => parseHuntMap({ ...map, layers: { ...map.layers, ground: ['grass'] } })).toThrow(/width\*height/)
  })
})
