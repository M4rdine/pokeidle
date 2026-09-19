import type { RgbaImage } from './compose.js'

const BYTES_PER_RGBA = 4
const ANIMATION_SUFFIX = /^(.*)_(\d+)$/

export interface AtlasFrame {
  readonly name: string
  readonly image: RgbaImage
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface PixiFrame {
  frame: Rect
  rotated: false
  trimmed: false
  spriteSourceSize: Rect
  sourceSize: { w: number; h: number }
}

export interface PixiSpritesheet {
  frames: Record<string, PixiFrame>
  animations: Record<string, string[]>
  meta: {
    image: string
    format: 'RGBA8888'
    size: { w: number; h: number }
    scale: '1'
    columns: number
    cell: { w: number; h: number }
    padding: number
  }
}

export interface TiledWangColor { name: string; color: string; probability: number; tile: number }
export interface TiledWangTile { tileid: number; wangid: number[] }
export interface TiledWangset { name: string; type: 'corner'; tile: -1; colors: TiledWangColor[]; wangtiles: TiledWangTile[] }

export interface TerrainInput {
  readonly name: string
  readonly colors: readonly string[]
  readonly tiles: readonly { readonly tile: string; readonly corners: readonly [string, string, string, string] }[]
}

export interface TiledTileset {
  type: 'tileset'
  version: string
  name: string
  image: string
  imagewidth: number
  imageheight: number
  tilewidth: number
  tileheight: number
  tilecount: number
  columns: number
  margin: number
  spacing: number
  tiles: Array<{ id: number; properties: Array<{ name: 'name'; type: 'string'; value: string }> }>
  wangsets?: TiledWangset[]
}

function blitInto(src: RgbaImage, dst: Uint8Array, dstWidth: number, ox: number, oy: number): void {
  for (let y = 0; y < src.height; y++) {
    const srcRow = y * src.width * BYTES_PER_RGBA
    const dstRow = ((oy + y) * dstWidth + ox) * BYTES_PER_RGBA
    dst.set(src.data.subarray(srcRow, srcRow + src.width * BYTES_PER_RGBA), dstRow)
  }
}

function groupAnimations(names: readonly string[]): Record<string, string[]> {
  const groups = new Map<string, Array<{ n: number; name: string }>>()
  for (const name of names) {
    const match = ANIMATION_SUFFIX.exec(name)
    if (!match) continue
    const prefix = match[1]!
    const list = groups.get(prefix) ?? []
    groups.set(prefix, [...list, { n: Number(match[2]), name }])
  }
  return Object.fromEntries(
    [...groups.entries()].map(([prefix, list]) => [prefix, [...list].sort((a, b) => a.n - b.n).map((e) => e.name)]),
  )
}

export function packGrid(
  frames: readonly AtlasFrame[],
  imageName: string,
  padding = 0,
  animations?: Readonly<Record<string, readonly string[]>>,
): { image: RgbaImage; sheet: PixiSpritesheet } {
  if (frames.length === 0) throw new Error('packGrid: nenhum frame para empacotar')
  const cellW = Math.max(...frames.map((f) => f.image.width))
  const cellH = Math.max(...frames.map((f) => f.image.height))
  const columns = Math.ceil(Math.sqrt(frames.length))
  const rows = Math.ceil(frames.length / columns)
  const width = columns * cellW + (columns - 1) * padding
  const height = rows * cellH + (rows - 1) * padding
  const data = new Uint8Array(width * height * BYTES_PER_RGBA)

  const pixiFrames: Record<string, PixiFrame> = {}
  frames.forEach((f, i) => {
    const x = (i % columns) * (cellW + padding)
    const y = Math.floor(i / columns) * (cellH + padding)
    blitInto(f.image, data, width, x, y)
    const w = f.image.width
    const h = f.image.height
    pixiFrames[f.name] = {
      frame: { x, y, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
    }
  })

  return {
    image: { width, height, data },
    sheet: {
      frames: pixiFrames,
      animations: animations
        ? Object.fromEntries(Object.entries(animations).map(([key, names]) => [key, [...names]]))
        : groupAnimations(frames.map((f) => f.name)),
      meta: { image: imageName, format: 'RGBA8888', size: { w: width, h: height }, scale: '1', columns, cell: { w: cellW, h: cellH }, padding },
    },
  }
}

/** Cores de exibição no Tiled; só precisam ser distintas entre si. */
const WANG_COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ff8000', '#8000ff', '#808080', '#804000', '#008080', '#800000', '#008000', '#000080', '#c0c0c0']

function toWangset(terrain: TerrainInput, tileId: (name: string) => number): TiledWangset {
  const colorIndex = new Map(terrain.colors.map((name, i) => [name, i + 1]))
  return {
    name: terrain.name,
    type: 'corner',
    tile: -1,
    colors: terrain.colors.map((name, i) => ({ name, color: WANG_COLORS[i % WANG_COLORS.length]!, probability: 1, tile: -1 })),
    wangtiles: terrain.tiles.map((entry) => {
      const corner = (name: string): number => {
        const index = colorIndex.get(name)
        if (index === undefined) throw new Error(`terreno ${terrain.name}: cor "${name}" não está em colors`)
        return index
      }
      const [topRight, bottomRight, bottomLeft, topLeft] = entry.corners
      // Num conjunto "corner" o Tiled só lê os índices ímpares; os pares ficam em 0.
      return { tileid: tileId(entry.tile), wangid: [0, corner(topRight), 0, corner(bottomRight), 0, corner(bottomLeft), 0, corner(topLeft)] }
    }),
  }
}

export function toTiledTileset(
  sheet: PixiSpritesheet,
  name: string,
  order: readonly string[],
  terrains: readonly TerrainInput[] = [],
): TiledTileset {
  // A ordem pode cobrir só parte dos frames de propósito: os quadros de fase de um tile animado
  // ficam no tiles.json e fora do tiles.tsj, para a paleta do Tiled não repetir a mesma peça.
  if (order.length === 0) throw new Error('ordem de frames vazia: o tileset ficaria sem nenhum tile')
  const unknown = order.filter((n) => sheet.frames[n] === undefined)
  if (unknown.length > 0) throw new Error(`ordem de frames cita nomes fora do spritesheet: ${unknown.join(', ')}`)
  if (new Set(order).size !== order.length) throw new Error('ordem de frames tem nome repetido')
  // O Tiled deriva o id de um tileset de imagem pela célula da grade, contando TODA célula da
  // imagem — inclusive os quadros de fase, que ficam fora de `order`. Numerar pela posição em
  // `order` grudaria o nome no tile errado a partir do primeiro animado.
  const { columns, cell, padding } = sheet.meta
  const gridId = (tileName: string): number => {
    const frame = sheet.frames[tileName]?.frame
    if (frame === undefined) throw new Error(`terreno cita tile "${tileName}", que não está no tileset`)
    return (frame.y / (cell.h + padding)) * columns + frame.x / (cell.w + padding)
  }
  const named = new Set(order)
  const tileId = (tileName: string): number => {
    if (!named.has(tileName)) throw new Error(`terreno cita tile "${tileName}", que não está no tileset`)
    return gridId(tileName)
  }
  const rows = Math.ceil((sheet.meta.size.h + padding) / (cell.h + padding))
  return {
    type: 'tileset',
    version: '1.10',
    name,
    image: sheet.meta.image,
    imagewidth: sheet.meta.size.w,
    imageheight: sheet.meta.size.h,
    tilewidth: sheet.meta.cell.w,
    tileheight: sheet.meta.cell.h,
    // Igual ao que o Tiled calcula sozinho a partir da imagem: toda célula da grade conta.
    tilecount: columns * rows,
    columns: sheet.meta.columns,
    margin: 0,
    spacing: sheet.meta.padding,
    tiles: order.map((value) => ({ id: gridId(value), properties: [{ name: 'name' as const, type: 'string' as const, value } as const] })),
    ...(terrains.length > 0 && { wangsets: terrains.map((t) => toWangset(t, tileId)) }),
  }
}
