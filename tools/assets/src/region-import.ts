/**
 * Região é o mapa desenhado uma vez; área é um retângulo dentro dele. Este módulo recorta a
 * região em mapas de área no formato que `importTiledMap` já consome, então toda a validação
 * existente continua valendo, área por área, sem o motor mudar de comportamento.
 */
import { TILE_SIZE, type HuntMap } from '@pokeidle/shared'
import type { TiledTileset } from './atlas.js'
import { importTiledMap, type ImportOptions } from './tiled-import.js'

export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

interface TileLayer {
  readonly type: 'tilelayer'
  readonly name: string
  readonly data: readonly number[]
}
interface ObjectLayer {
  readonly type: 'objectgroup'
  readonly name: string
  readonly objects: readonly TiledObjectLike[]
}
interface OtherLayer {
  readonly type: 'imagelayer' | 'group'
  readonly name: string
}
type AnyLayer = TileLayer | ObjectLayer | OtherLayer

export interface TiledObjectLike {
  readonly id: number
  readonly class?: string | undefined
  readonly type?: string | undefined
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly properties?: readonly unknown[] | undefined
}

export interface TiledMapLike {
  readonly orientation: 'orthogonal'
  readonly width: number
  readonly height: number
  readonly tilewidth: number
  readonly tileheight: number
  readonly tilesets: readonly { readonly firstgid: number }[]
  readonly layers: readonly AnyLayer[]
}

const isTileLayer = (l: AnyLayer): l is TileLayer => l.type === 'tilelayer'
const isObjectLayer = (l: AnyLayer): l is ObjectLayer => l.type === 'objectgroup'

/** O tile que contém o canto superior esquerdo do objeto. */
const tileOf = (o: TiledObjectLike): { x: number; y: number } => ({
  x: Math.floor(o.x / TILE_SIZE),
  y: Math.floor(o.y / TILE_SIZE),
})

const inside = (rect: Rect, x: number, y: number): boolean =>
  x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height

function cropLayer(layer: TileLayer, mapWidth: number, rect: Rect): TileLayer {
  const data: number[] = []
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) data.push(layer.data[y * mapWidth + x] ?? 0)
  }
  return { type: 'tilelayer', name: layer.name, data }
}

function cropObjects(layer: ObjectLayer, rect: Rect): ObjectLayer {
  const objects = layer.objects
    .filter((o) => {
      const t = tileOf(o)
      return inside(rect, t.x, t.y)
    })
    .map((o) => ({ ...o, x: o.x - rect.x * TILE_SIZE, y: o.y - rect.y * TILE_SIZE }))
  return { type: 'objectgroup', name: layer.name, objects }
}

/**
 * Devolve um mapa novo com o conteúdo do retângulo. Camadas de tile são recortadas, objetos fora
 * do retângulo são descartados e os de dentro têm a coordenada traduzida para o referencial da
 * área. O mapa de entrada nunca é alterado.
 */
export function cropRegion(map: TiledMapLike, rect: Rect): TiledMapLike {
  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error(`área com largura e altura precisa ser positiva, recebi ${rect.width}x${rect.height}`)
  }
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > map.width || rect.y + rect.height > map.height) {
    throw new Error(
      `área em (${rect.x}, ${rect.y}) de ${rect.width}x${rect.height} fica fora dos limites do mapa ${map.width}x${map.height}`,
    )
  }
  const layers = map.layers.map((l): AnyLayer => {
    if (isTileLayer(l)) return cropLayer(l, map.width, rect)
    if (isObjectLayer(l)) return cropObjects(l, rect)
    return l
  })
  return { ...map, width: rect.width, height: rect.height, layers }
}

/** Metadados de uma área, no referencial da região, para o navegador de áreas do cliente. */
export interface AreaMeta {
  readonly id: string
  readonly name: string
  readonly bounds: Rect
  /** Onde desenhar o marcador no mapa da região: o centro do retângulo. */
  readonly anchor: { readonly x: number; readonly y: number }
  readonly species: readonly string[]
  readonly minLevel: number
  readonly maxLevel: number
}

export interface RegionMeta {
  readonly id: string
  readonly name: string
  readonly order: number
  readonly minTrainerLevel: number
  readonly width: number
  readonly height: number
  readonly areas: readonly AreaMeta[]
}

interface MapProp {
  readonly name: string
  readonly value: unknown
}

function mapProp(props: readonly MapProp[] | undefined, name: string): unknown {
  return props?.find((p) => p.name === name)?.value
}

function requireString(props: readonly MapProp[] | undefined, name: string, onde: string): string {
  const v = mapProp(props, name)
  if (typeof v !== 'string' || v.length === 0) throw new Error(`${onde}: falta a propriedade de texto "${name}"`)
  return v
}

function requireNumber(props: readonly MapProp[] | undefined, name: string, onde: string): number {
  const v = mapProp(props, name)
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${onde}: falta a propriedade numérica "${name}"`)
  return v
}

const AREA_CLASS = 'area'
const objClass = (o: TiledObjectLike): string => o.class ?? o.type ?? ''

/** Retângulo da área em tiles, a partir do objeto em pixels. */
function areaRect(o: TiledObjectLike): Rect {
  return {
    x: Math.round(o.x / TILE_SIZE),
    y: Math.round(o.y / TILE_SIZE),
    width: Math.round(o.width / TILE_SIZE),
    height: Math.round(o.height / TILE_SIZE),
  }
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

interface AreaDef {
  readonly id: string
  readonly name: string
  readonly rect: Rect
}

function readAreas(map: TiledMapLike): AreaDef[] {
  const objs = map.layers.filter(isObjectLayer).flatMap((l) => l.objects)
  const areas = objs
    .filter((o) => objClass(o) === AREA_CLASS)
    .map((o) => {
      const props = o.properties as readonly MapProp[] | undefined
      const onde = `área do objeto ${o.id}`
      return { id: requireString(props, 'id', onde), name: requireString(props, 'name', onde), rect: areaRect(o) }
    })
  if (areas.length === 0) throw new Error('região sem nenhum objeto "area": nada a recortar')

  const vistos = new Set<string>()
  for (const a of areas) {
    if (vistos.has(a.id)) throw new Error(`identificador de área repetido: ${a.id}`)
    vistos.add(a.id)
  }
  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      const a = areas[i]!
      const b = areas[j]!
      if (overlaps(a.rect, b.rect)) throw new Error(`áreas "${a.id}" e "${b.id}" se sobrepõem`)
    }
  }
  return areas
}

/** Objeto de conteúdo que não caiu em nenhuma área é erro: ele seria silenciosamente perdido. */
function checkOrphans(map: TiledMapLike, areas: readonly AreaDef[]): void {
  const soltos = map.layers
    .filter(isObjectLayer)
    .flatMap((l) => l.objects)
    .filter((o) => objClass(o) !== AREA_CLASS)
    .filter((o) => {
      const t = tileOf(o)
      return !areas.some((a) => inside(a.rect, t.x, t.y))
    })
  if (soltos.length > 0) {
    const lista = soltos.map((o) => `${objClass(o) || 'sem classe'} (objeto ${o.id})`).join(', ')
    throw new Error(`objeto fora de qualquer área: ${lista}`)
  }
}

/**
 * Recorta a região em um `HuntMap` por área, reusando `importTiledMap` — e com ele todas as
 * validações que já existem — em cada recorte.
 */
export function importRegion(
  json: unknown,
  tileset: TiledTileset,
  options?: ImportOptions,
): { region: RegionMeta; hunts: HuntMap[] } {
  const map = json as TiledMapLike & { properties?: readonly MapProp[] }
  const props = map.properties
  const id = requireString(props, 'id', 'região')
  const name = requireString(props, 'name', 'região')
  const order = requireNumber(props, 'order', 'região')
  const minTrainerLevel = requireNumber(props, 'minTrainerLevel', 'região')

  const areas = readAreas(map)
  checkOrphans(map, areas)

  const hunts: HuntMap[] = []
  const metas: AreaMeta[] = []
  for (const area of areas) {
    const recorte = cropRegion(map, area.rect)
    let hunt: HuntMap
    try {
      hunt = importTiledMap(recorte, tileset, { id: area.id, name: area.name }, options)
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error)
      throw new Error(`área "${area.id}": ${motivo}`)
    }
    hunts.push(hunt)
    const niveis = hunt.spawns.flatMap((s) => [s.minLevel, s.maxLevel])
    metas.push({
      id: area.id,
      name: area.name,
      bounds: area.rect,
      anchor: { x: area.rect.x + Math.floor(area.rect.width / 2), y: area.rect.y + Math.floor(area.rect.height / 2) },
      species: [...new Set(hunt.spawns.map((s) => s.speciesName))],
      minLevel: Math.min(...niveis),
      maxLevel: Math.max(...niveis),
    })
  }

  return { region: { id, name, order, minTrainerLevel, width: map.width, height: map.height, areas: metas }, hunts }
}
