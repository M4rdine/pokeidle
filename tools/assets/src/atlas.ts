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

export interface TiledTileset {
  type: 'tileset'
  version: '1.10'
  name: string
  image: string
  imagewidth: number
  imageheight: number
  tilewidth: number
  tileheight: number
  tilecount: number
  columns: number
  margin: 0
  spacing: number
  tiles: Array<{ id: number; properties: Array<{ name: 'name'; type: 'string'; value: string }> }>
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

export function packGrid(frames: readonly AtlasFrame[], imageName: string, padding = 0): { image: RgbaImage; sheet: PixiSpritesheet } {
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
      animations: groupAnimations(frames.map((f) => f.name)),
      meta: { image: imageName, format: 'RGBA8888', size: { w: width, h: height }, scale: '1', columns, cell: { w: cellW, h: cellH }, padding },
    },
  }
}

export function toTiledTileset(sheet: PixiSpritesheet, name: string): TiledTileset {
  const names = Object.keys(sheet.frames)
  return {
    type: 'tileset',
    version: '1.10',
    name,
    image: sheet.meta.image,
    imagewidth: sheet.meta.size.w,
    imageheight: sheet.meta.size.h,
    tilewidth: sheet.meta.cell.w,
    tileheight: sheet.meta.cell.h,
    tilecount: names.length,
    columns: sheet.meta.columns,
    margin: 0,
    spacing: sheet.meta.padding,
    tiles: names.map((value, id) => ({ id, properties: [{ name: 'name', type: 'string', value }] })),
  }
}
