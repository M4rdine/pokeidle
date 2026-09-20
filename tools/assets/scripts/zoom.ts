import { readFileSync, writeFileSync } from 'node:fs'
import { decodePng, encodePng } from '../src/png.js'

const [src, out, zoomArg] = process.argv.slice(2)
const Z = Number(zoomArg ?? 4)
const img = decodePng(readFileSync(src!))
const w = img.width * Z
const h = img.height * Z
const data = new Uint8Array(w * h * 4)
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const si = (Math.floor(y / Z) * img.width + Math.floor(x / Z)) * 4
    data.set(img.data.subarray(si, si + 4), (y * w + x) * 4)
  }
}
writeFileSync(out!, encodePng({ width: w, height: h, data }))
process.stdout.write(`ok ${w}x${h}\n`)
