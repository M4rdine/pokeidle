import { describe, expect, it } from 'vitest'
import { parseHuntMap } from '@pokeidle/shared'
import { packGrid, toTiledTileset, type TerrainInput, type TiledTileset } from '../src/atlas.js'
import { importTiledMap, parseTiledTileset } from '../src/tiled-import.js'

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

// mapa 3x3: chão todo grass, montanha no canto superior direito, bloqueio no canto
// inferior direito. Ponto de partida no canto (0,0), Centro Pokémon no meio (1,1) —
// longe o bastante da borda para passar nas validações novas do importador.
const tiled = {
  type: 'map',
  orientation: 'orthogonal',
  width: 3,
  height: 3,
  tilewidth: 32,
  tileheight: 32,
  tilesets: [{ firstgid: 1, source: 'tiles.tsj' }],
  layers: [
    { type: 'tilelayer', name: 'ground', width: 3, height: 3, data: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
    { type: 'tilelayer', name: 'detail', width: 3, height: 3, data: [0, 0, 2, 0, 0, 0, 0, 0, 0] },
    { type: 'tilelayer', name: 'blocking', width: 3, height: 3, data: [0, 0, 0, 0, 0, 0, 0, 0, 1] },
    {
      type: 'objectgroup',
      name: 'objects',
      objects: [
        { id: 1, class: 'spawnPoint', x: 0, y: 0, width: 32, height: 32 },
        { id: 2, class: 'pokecenter', x: 32, y: 32, width: 32, height: 32 },
        {
          id: 3,
          class: 'spawn',
          x: 32,
          y: 64,
          width: 32,
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
    expect(map).toMatchObject({ id: 'route-1', name: 'Rota 1', width: 3, height: 3, tileSize: 32 })
    expect(map.layers.ground).toEqual(['grass', 'grass', 'grass', 'grass', 'grass', 'grass', 'grass', 'grass', 'grass'])
    expect(map.layers.detail).toEqual([null, null, 'mountain', null, null, null, null, null, null])
    expect(map.layers.blocking).toEqual([false, false, false, false, false, false, false, false, true])
  })

  it('converte objetos em posições de tile e spawns', () => {
    expect(map.spawnPoint).toEqual({ x: 0, y: 0 })
    expect(map.pokecenter).toEqual({ x: 1, y: 1 })
    expect(map.spawns).toEqual([
      { speciesName: 'rattata', minLevel: 2, maxLevel: 5, x: 1, y: 2, radius: 1, count: 3, respawnSeconds: 20 },
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
    const bad = { ...tiled, layers: [{ ...tiled.layers[0]!, data: [1, 1, 1, 1, 1, 1, 1, 1, 9] }, ...tiled.layers.slice(1)] }
    expect(() => importTiledMap(bad, tileset, { id: 'x', name: 'x' })).toThrow(/gid 9/)
  })

  it('falha com mais de um tileset', () => {
    const multi = { ...tiled, tilesets: [{ firstgid: 1, source: 'a.tsj' }, { firstgid: 50, source: 'b.tsj' }] }
    expect(() => importTiledMap(multi, tileset, { id: 'x', name: 'x' })).toThrow(/2 tilesets/)
  })

  it('falha com mensagem explicativa em mapa exportado com formato incompatível', () => {
    const compressed = { ...tiled, layers: [{ ...tiled.layers[0]!, data: 'AAAA' }, ...tiled.layers.slice(1)] }
    expect(() => importTiledMap(compressed, tileset, { id: 'x', name: 'x' })).toThrow(/mapa Tiled inválido[\s\S]*CSV/)
  })

  it('explica que camadas dentro de grupos não são suportadas', () => {
    const grouped = { ...tiled, layers: [{ type: 'group', name: 'tudo' }, ...tiled.layers.slice(1)] }
    expect(() => importTiledMap(grouped, tileset, { id: 'x', name: 'x' })).toThrow(/camada de tiles "ground".*grupos/)
  })

  it('aceita espécie desconhecida quando nenhum conjunto é informado', () => {
    expect(() => importTiledMap(tiled, tileset, { id: 'x', name: 'x' })).not.toThrow()
  })

  it('aceita spawn com espécie do registro real (zubat) sem consultá-lo, pois o importador puro não conhece registro', () => {
    const tiledWithZubat = {
      ...tiled,
      layers: [
        tiled.layers[0],
        tiled.layers[1],
        tiled.layers[2],
        {
          type: 'objectgroup',
          name: 'objects',
          objects: [
            { id: 1, class: 'spawnPoint', x: 0, y: 0, width: 32, height: 32 },
            { id: 2, class: 'pokecenter', x: 32, y: 32, width: 32, height: 32 },
            {
              id: 3,
              class: 'spawn',
              x: 0,
              y: 32,
              width: 64,
              height: 32,
              properties: [
                { name: 'species', type: 'string', value: 'zubat' },
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
    const map = importTiledMap(tiledWithZubat, tileset, { id: 'x', name: 'x' })
    expect(map.spawns[0]?.speciesName).toBe('zubat')
  })

  it('rejeita espécie fora do manifest quando knownSpecies é informado', () => {
    expect(() => importTiledMap(tiled, tileset, { id: 'x', name: 'x' }, { knownSpecies: new Set(['pidgey']) })).toThrow(
      /espécie desconhecida "rattata" no spawn \(objeto 3\)/,
    )
    expect(() =>
      importTiledMap(tiled, tileset, { id: 'x', name: 'x' }, { knownSpecies: new Set(['rattata']) }),
    ).not.toThrow()
  })
})

interface TileCoord {
  readonly x: number
  readonly y: number
}

interface SpawnCoord extends TileCoord {
  readonly radius: number
}

interface TiledMapOptions {
  readonly width?: number
  readonly height?: number
  readonly blockingAt?: readonly TileCoord[]
  readonly blockingAll?: boolean
  readonly spawnPoint?: TileCoord
  readonly pokecenter?: TileCoord
  readonly spawnAt?: SpawnCoord
}

/** Monta um mapa Tiled falso (largura/altura configuráveis, padrão 4x4) para os testes de validação. */
function tiledMapWith(options: TiledMapOptions): unknown {
  const width = options.width ?? 4
  const height = options.height ?? 4
  const spawnPoint = options.spawnPoint ?? { x: 0, y: 0 }
  const pokecenter = options.pokecenter ?? { x: 2, y: 2 }
  const spawnAt = options.spawnAt ?? { x: 1, y: 1, radius: 1 }
  const blockedKeys = new Set((options.blockingAt ?? []).map((p) => `${p.x},${p.y}`))

  const groundData = new Array<number>(width * height).fill(1)
  const detailData = new Array<number>(width * height).fill(0)
  const blockingData = Array.from({ length: width * height }, (_, i) => {
    if (options.blockingAll === true) return 1
    const x = i % width
    const y = Math.floor(i / width)
    return blockedKeys.has(`${x},${y}`) ? 1 : 0
  })

  // objeto centrado exatamente no tile (x, y), com tamanho que produz o `radius` desejado
  // (ver fórmula em toSpawn: radius = ceil(max(width, height) / 2 / TILE_SIZE)).
  const spawnSize = spawnAt.radius * 2 * 32
  const spawnObjectX = spawnAt.x * 32 + 16 - spawnSize / 2
  const spawnObjectY = spawnAt.y * 32 + 16 - spawnSize / 2

  return {
    type: 'map',
    orientation: 'orthogonal',
    width,
    height,
    tilewidth: 32,
    tileheight: 32,
    tilesets: [{ firstgid: 1, source: 'tiles.tsj' }],
    layers: [
      { type: 'tilelayer', name: 'ground', width, height, data: groundData },
      { type: 'tilelayer', name: 'detail', width, height, data: detailData },
      { type: 'tilelayer', name: 'blocking', width, height, data: blockingData },
      {
        type: 'objectgroup',
        name: 'objects',
        objects: [
          { id: 1, class: 'spawnPoint', x: spawnPoint.x * 32, y: spawnPoint.y * 32, width: 32, height: 32 },
          { id: 2, class: 'pokecenter', x: pokecenter.x * 32, y: pokecenter.y * 32, width: 32, height: 32 },
          {
            id: 3,
            class: 'spawn',
            x: spawnObjectX,
            y: spawnObjectY,
            width: spawnSize,
            height: spawnSize,
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
}

describe('validações do mapa', () => {
  const meta = { id: 'route-1', name: 'Rota 1' }

  it('recusa ponto de partida e Centro em tile bloqueado, e lista os dois de uma vez', () => {
    const map = tiledMapWith({ blockingAt: [{ x: 0, y: 0 }, { x: 1, y: 1 }], spawnPoint: { x: 0, y: 0 }, pokecenter: { x: 1, y: 1 } })
    expect(() => importTiledMap(map, tileset, meta)).toThrow(/ponto de partida[\s\S]*Centro Pokémon/)
  })

  it('recusa spawn sem nenhum tile livre no raio', () => {
    const map = tiledMapWith({ blockingAll: true, spawnPoint: { x: 0, y: 0 }, pokecenter: { x: 1, y: 0 }, spawnAt: { x: 2, y: 0, radius: 0 } })
    expect(() => importTiledMap(map, tileset, meta)).toThrow(/spawn.*sem tile livre/)
  })

  it('recusa Centro colado na borda do mapa', () => {
    const map = tiledMapWith({ pokecenter: { x: 0, y: 0 } })
    expect(() => importTiledMap(map, tileset, meta)).toThrow(/Centro Pokémon.*borda/)
  })

  it('trata Centro fora dos limites do mapa como bloqueado, sem vazar dados da próxima linha', () => {
    // pokecenter na coluna 3 de um mapa 3x3 (colunas válidas 0..2): sem o limite de x em
    // blockedAt, `y*width+x` cairia na linha seguinte (aqui livre) e o Centro passaria como
    // "não bloqueado" por acidente, em vez de ser recusado por estar fora do grid.
    const map = tiledMapWith({ width: 3, height: 3, spawnPoint: { x: 0, y: 0 }, pokecenter: { x: 3, y: 1 } })
    expect(() => importTiledMap(map, tileset, meta)).toThrow(/Centro Pokémon em \(3, 1\) está num tile bloqueado/)
  })

  it('aceita um mapa correto e devolve as camadas', () => {
    const map = tiledMapWith({})
    const hunt = importTiledMap(map, tileset, meta)
    expect(hunt.layers.ground).toHaveLength(hunt.width * hunt.height)
    expect(hunt.spawns.length).toBeGreaterThan(0)
  })

  it('recusa Centro Pokémon murado, mesmo com o próprio tile livre (inalcançável por A*)', () => {
    // o tile do Centro (2,2) fica livre, mas os quatro vizinhos ortogonais estão bloqueados:
    // nenhum caminho ortogonal alcança o Centro nem chega adjacente a ele.
    const map = tiledMapWith({
      width: 5,
      height: 5,
      spawnPoint: { x: 0, y: 0 },
      pokecenter: { x: 2, y: 2 },
      blockingAt: [{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 2, y: 1 }, { x: 2, y: 3 }],
      spawnAt: { x: 0, y: 1, radius: 1 },
    })
    expect(() => importTiledMap(map, tileset, meta)).toThrow(/Centro Pokémon em \(2, 2\) não é alcançável a partir do ponto de partida/)
  })

  it('recusa spawn num bolsão fechado, mesmo com tile livre dentro do raio', () => {
    // (4,4) é o canto do mapa: bloquear os dois únicos vizinhos ortogonais dentro dos limites
    // isola essa tile completamente, mesmo que ela continue livre.
    const map = tiledMapWith({
      width: 5,
      height: 5,
      spawnPoint: { x: 0, y: 0 },
      pokecenter: { x: 2, y: 2 },
      blockingAt: [{ x: 3, y: 4 }, { x: 4, y: 3 }],
      spawnAt: { x: 4, y: 4, radius: 0 },
    })
    expect(() => importTiledMap(map, tileset, meta)).toThrow(/spawn de rattata em \(4, 4\) não tem tile livre alcançável no raio 0/)
  })
})

describe('parseTiledTileset', () => {
  it('aceita o tiles.tsj gerado pelo build', () => {
    expect(parseTiledTileset(JSON.parse(JSON.stringify(tileset)))).toEqual(tileset)
  })

  it('rejeita objeto que não é um tileset do Tiled', () => {
    expect(() => parseTiledTileset({ type: 'map', tiles: [] })).toThrow(/tileset inválido/)
  })

  it('faz a ida e volta com o tileset gerado por toTiledTileset, com terreno, preservando os tiles', () => {
    const packed = packGrid([
      { name: 'grass', image: { width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(10) } },
      { name: 'dirt', image: { width: 32, height: 32, data: new Uint8Array(32 * 32 * 4).fill(20) } },
    ], 'tiles.png')
    const terrain: TerrainInput = {
      name: 'grama-terra',
      colors: ['grama', 'terra'],
      tiles: [
        { tile: 'grass', corners: ['grama', 'grama', 'grama', 'grama'] },
        { tile: 'dirt', corners: ['terra', 'terra', 'terra', 'terra'] },
      ],
    }
    const generated = toTiledTileset(packed.sheet, 'tibia-tiles', ['grass', 'dirt'], [terrain])

    // simula a volta pelo disco: o JSON escrito pelo build vira um `unknown` lido de volta pelo importador.
    const roundTripped = parseTiledTileset(JSON.parse(JSON.stringify(generated)))

    expect(roundTripped.tiles).toEqual(generated.tiles)
    expect(roundTripped.tilecount).toBe(2)
  })

  it('descarta wangsets presentes sem erro', () => {
    const withWangsets = {
      ...tileset,
      wangsets: [{ name: 'grama-terra', type: 'corner', tile: -1, colors: [], wangtiles: [] }],
    }
    const parsed = parseTiledTileset(withWangsets)
    expect(parsed).not.toHaveProperty('wangsets')
    expect(parsed.tiles).toEqual(tileset.tiles)
  })
})

describe('parseHuntMap', () => {
  const map = importTiledMap(tiled, tileset, { id: 'r', name: 'r' })

  it('rejeita camada com tamanho errado', () => {
    expect(() => parseHuntMap({ ...map, layers: { ...map.layers, ground: ['grass'] } })).toThrow(/width\*height/)
  })

  it('rejeita spawn fora do mapa', () => {
    const outside = { ...map, spawns: [{ ...map.spawns[0]!, x: 3 }] }
    expect(() => parseHuntMap(outside)).toThrow(/spawns\.0: fora do mapa \(3x3\)/)
  })

  it('rejeita spawnPoint e pokecenter fora do mapa', () => {
    expect(() => parseHuntMap({ ...map, spawnPoint: { x: 0, y: 5 } })).toThrow(/spawnPoint: fora do mapa/)
    expect(() => parseHuntMap({ ...map, pokecenter: { x: 9, y: 0 } })).toThrow(/pokecenter: fora do mapa/)
  })
})
