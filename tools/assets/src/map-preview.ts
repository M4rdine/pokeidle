import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { HuntMap } from '@pokeidle/shared'
import type { PixiSpritesheet } from './atlas.js'
import type { RgbaImage } from './compose.js'
import { decodePng } from './png.js'

const BYTES_PER_RGBA = 4
const BLOCKING_TINT = { r: 255, g: 40, b: 40, alpha: 0.45 }

export interface TilesAtlas { readonly sheet: PixiSpritesheet; readonly image: RgbaImage }

export async function loadTilesAtlas(dir: string): Promise<TilesAtlas> {
  const sheet = JSON.parse(await readFile(join(dir, 'tiles.json'), 'utf8')) as PixiSpritesheet
  return { sheet, image: decodePng(await readFile(join(dir, 'tiles.png'))) }
}

function blitTile(target: RgbaImage, atlas: TilesAtlas, name: string, destX: number, destY: number): void {
  const frame = atlas.sheet.frames[name]?.frame
  if (!frame) throw new Error(`tile "${name}" não está no atlas`)
  for (let y = 0; y < frame.h; y++) {
    for (let x = 0; x < frame.w; x++) {
      const from = ((frame.y + y) * atlas.image.width + frame.x + x) * BYTES_PER_RGBA
      const alpha = atlas.image.data[from + 3]!
      if (alpha === 0) continue
      const to = ((destY + y) * target.width + destX + x) * BYTES_PER_RGBA
      target.data.set(atlas.image.data.subarray(from, from + BYTES_PER_RGBA), to)
    }
  }
}

function tintBlocking(target: RgbaImage, destX: number, destY: number, size: number): void {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = ((destY + y) * target.width + destX + x) * BYTES_PER_RGBA
      target.data[i] = Math.round(target.data[i]! * (1 - BLOCKING_TINT.alpha) + BLOCKING_TINT.r * BLOCKING_TINT.alpha)
      target.data[i + 1] = Math.round(target.data[i + 1]! * (1 - BLOCKING_TINT.alpha) + BLOCKING_TINT.g * BLOCKING_TINT.alpha)
      target.data[i + 2] = Math.round(target.data[i + 2]! * (1 - BLOCKING_TINT.alpha) + BLOCKING_TINT.b * BLOCKING_TINT.alpha)
    }
  }
}

/** Desenha `ground` e depois `detail`; com `blocking`, tinge de vermelho os tiles bloqueados. */
export function renderMapPreview(map: HuntMap, atlas: TilesAtlas, opts: { blocking?: boolean } = {}): RgbaImage {
  const size = map.tileSize
  const target: RgbaImage = {
    width: map.width * size,
    height: map.height * size,
    data: new Uint8Array(map.width * size * map.height * size * BYTES_PER_RGBA),
  }
  for (const layer of [map.layers.ground, map.layers.detail]) {
    layer.forEach((name, i) => {
      if (name !== null) blitTile(target, atlas, name, (i % map.width) * size, Math.floor(i / map.width) * size)
    })
  }
  if (opts.blocking === true) {
    map.layers.blocking.forEach((blocked, i) => {
      if (blocked) tintBlocking(target, (i % map.width) * size, Math.floor(i / map.width) * size, size)
    })
  }
  return target
}
