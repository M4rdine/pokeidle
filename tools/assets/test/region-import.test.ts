import { describe, expect, it } from 'vitest'
import { importRegion } from '../src/region-import.js'
import type { TiledTileset } from '../src/atlas.js'

const tileset: TiledTileset = {
  type: 'tileset', version: '1.10', name: 't', image: 'tiles.png',
  imagewidth: 64, imageheight: 32, tilewidth: 32, tileheight: 32,
  tilecount: 2, columns: 2, margin: 0, spacing: 0,
  tiles: [
    { id: 0, properties: [{ name: 'name', type: 'string', value: 'grass' }] },
    { id: 1, properties: [{ name: 'name', type: 'string', value: 'mountain' }] },
  ],
}

const spawnProps = [
  { name: 'species', type: 'string', value: 'rattata' },
  { name: 'minLevel', type: 'int', value: 2 },
  { name: 'maxLevel', type: 'int', value: 5 },
  { name: 'count', type: 'int', value: 2 },
  { name: 'respawnSeconds', type: 'int', value: 20 },
]

/** Região 10×5 com duas áreas de 5×5 lado a lado, cada uma completa. */
function regiao(over: { areas?: unknown[]; objetos?: unknown[] } = {}) {
  const linha = Array.from({ length: 50 }, () => 1)
  const zeros = Array.from({ length: 50 }, () => 0)
  const px = (t: number) => t * 32
  const areaObjs = over.areas ?? [
    { id: 100, class: 'area', name: 'a', x: px(0), y: px(0), width: px(5), height: px(5), properties: [{ name: 'id', type: 'string', value: 'rota-1' }, { name: 'name', type: 'string', value: 'Rota 1' }] },
    { id: 101, class: 'area', name: 'b', x: px(5), y: px(0), width: px(5), height: px(5), properties: [{ name: 'id', type: 'string', value: 'rota-2' }, { name: 'name', type: 'string', value: 'Rota 2' }] },
  ]
  const conteudo = over.objetos ?? [
    { id: 1, class: 'spawnPoint', x: px(1), y: px(1), width: 32, height: 32 },
    { id: 2, class: 'pokecenter', x: px(2), y: px(2), width: 32, height: 32 },
    { id: 3, class: 'spawn', x: px(1), y: px(3), width: 32, height: 32, properties: spawnProps },
    { id: 4, class: 'spawnPoint', x: px(6), y: px(1), width: 32, height: 32 },
    { id: 5, class: 'pokecenter', x: px(7), y: px(2), width: 32, height: 32 },
    { id: 6, class: 'spawn', x: px(6), y: px(3), width: 32, height: 32, properties: spawnProps },
  ]
  return {
    orientation: 'orthogonal', width: 10, height: 5, tilewidth: 32, tileheight: 32,
    tilesets: [{ firstgid: 1 }],
    properties: [
      { name: 'id', type: 'string', value: 'kanto' },
      { name: 'name', type: 'string', value: 'Kanto' },
      { name: 'order', type: 'int', value: 1 },
      { name: 'minTrainerLevel', type: 'int', value: 1 },
    ],
    layers: [
      { type: 'tilelayer', name: 'ground', data: linha },
      { type: 'tilelayer', name: 'detail', data: zeros },
      { type: 'tilelayer', name: 'blocking', data: zeros },
      { type: 'objectgroup', name: 'objects', objects: [...areaObjs, ...conteudo] },
    ],
  }
}

describe('importRegion', () => {
  it('devolve a região e um mapa por área, com o tamanho do recorte', () => {
    const { region, hunts } = importRegion(regiao(), tileset)
    expect(region).toMatchObject({ id: 'kanto', name: 'Kanto', order: 1, minTrainerLevel: 1, width: 10, height: 5 })
    expect(region.areas.map((a) => a.id)).toEqual(['rota-1', 'rota-2'])
    expect(hunts.map((h) => h.id)).toEqual(['rota-1', 'rota-2'])
    expect(hunts[0]).toMatchObject({ width: 5, height: 5, name: 'Rota 1' })
  })

  it('traduz as coordenadas dos objetos para o referencial da área', () => {
    const { hunts } = importRegion(regiao(), tileset)
    expect(hunts[0]!.spawnPoint).toEqual({ x: 1, y: 1 })
    // na região o ponto da segunda área está em x=6; dentro dela vira x=1
    expect(hunts[1]!.spawnPoint).toEqual({ x: 1, y: 1 })
    expect(hunts[1]!.pokecenter).toEqual({ x: 2, y: 2 })
  })

  it('guarda o marcador da área no referencial da região, para o mapa do navegador', () => {
    const { region } = importRegion(regiao(), tileset)
    expect(region.areas[0]!.anchor).toEqual({ x: 2, y: 2 })
    expect(region.areas[1]!.anchor).toEqual({ x: 7, y: 2 })
    expect(region.areas[1]!.bounds).toEqual({ x: 5, y: 0, width: 5, height: 5 })
  })

  it('resume as espécies e a faixa de nível de cada área', () => {
    const { region } = importRegion(regiao(), tileset)
    expect(region.areas[0]).toMatchObject({ species: ['rattata'], minLevel: 2, maxLevel: 5 })
  })

  it('recusa duas áreas com o mesmo identificador', () => {
    const px = (t: number) => t * 32
    const mesmas = [
      { id: 100, class: 'area', x: px(0), y: px(0), width: px(5), height: px(5), properties: [{ name: 'id', type: 'string', value: 'igual' }, { name: 'name', type: 'string', value: 'A' }] },
      { id: 101, class: 'area', x: px(5), y: px(0), width: px(5), height: px(5), properties: [{ name: 'id', type: 'string', value: 'igual' }, { name: 'name', type: 'string', value: 'B' }] },
    ]
    expect(() => importRegion(regiao({ areas: mesmas }), tileset)).toThrow(/identificador de área repetido: igual/)
  })

  it('recusa áreas que se sobrepõem', () => {
    const px = (t: number) => t * 32
    const sobrepostas = [
      { id: 100, class: 'area', x: px(0), y: px(0), width: px(6), height: px(5), properties: [{ name: 'id', type: 'string', value: 'a' }, { name: 'name', type: 'string', value: 'A' }] },
      { id: 101, class: 'area', x: px(5), y: px(0), width: px(5), height: px(5), properties: [{ name: 'id', type: 'string', value: 'b' }, { name: 'name', type: 'string', value: 'B' }] },
    ]
    expect(() => importRegion(regiao({ areas: sobrepostas }), tileset)).toThrow(/áreas "a" e "b" se sobrepõem/)
  })

  it('recusa objeto solto, fora de qualquer área', () => {
    const px = (t: number) => t * 32
    const objetos = [
      { id: 1, class: 'spawnPoint', x: px(1), y: px(1), width: 32, height: 32 },
      { id: 2, class: 'pokecenter', x: px(2), y: px(2), width: 32, height: 32 },
      { id: 3, class: 'spawn', x: px(1), y: px(3), width: 32, height: 32, properties: spawnProps },
      { id: 4, class: 'spawnPoint', x: px(6), y: px(1), width: 32, height: 32 },
      { id: 5, class: 'pokecenter', x: px(7), y: px(2), width: 32, height: 32 },
      { id: 6, class: 'spawn', x: px(6), y: px(3), width: 32, height: 32, properties: spawnProps },
    ]
    const soltoFora = regiao({ objetos })
    // move a segunda área para longe, deixando os objetos dela órfãos
    const grupo = soltoFora.layers.find((l) => l.type === 'objectgroup') as { objects: { class?: string; properties?: { value: unknown }[] }[] }
    grupo.objects = grupo.objects.filter((o) => o.class !== 'area' || o.properties?.[0]?.value === 'rota-1')
    expect(() => importRegion(soltoFora, tileset)).toThrow(/fora de qualquer área/)
  })

  it('propaga o erro de validação dizendo qual área falhou', () => {
    const px = (t: number) => t * 32
    const semCentro = [
      { id: 1, class: 'spawnPoint', x: px(1), y: px(1), width: 32, height: 32 },
      { id: 3, class: 'spawn', x: px(1), y: px(3), width: 32, height: 32, properties: spawnProps },
      { id: 4, class: 'spawnPoint', x: px(6), y: px(1), width: 32, height: 32 },
      { id: 5, class: 'pokecenter', x: px(7), y: px(2), width: 32, height: 32 },
      { id: 6, class: 'spawn', x: px(6), y: px(3), width: 32, height: 32, properties: spawnProps },
    ]
    expect(() => importRegion(regiao({ objetos: semCentro }), tileset)).toThrow(/área "rota-1"/)
  })
})
