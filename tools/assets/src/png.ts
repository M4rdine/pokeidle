import { PNG } from 'pngjs'
import type { RgbaImage } from './compose.js'

export function encodePng(img: RgbaImage): Buffer {
  const png = new PNG({ width: img.width, height: img.height })
  png.data = Buffer.from(img.data)
  return PNG.sync.write(png)
}

export function decodePng(buf: Uint8Array): RgbaImage {
  const png = PNG.sync.read(Buffer.from(buf))
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) }
}
