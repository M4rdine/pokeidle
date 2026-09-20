import { readFileSync, writeFileSync } from 'node:fs'
import { decodePng, encodePng, type RgbaImage } from '../src/png.js'

/** Desenha a grade do conjunto gerado com separadores, para mapear célula por célula. */
const img = decodePng(readFileSync(process.argv[2]!))
const CELL = 32
const Z = Number(process.env['Z'] ?? 5)
const GAP = 10
const cols = Math.floor(img.width / CELL)
const rows = Math.floor(img.height / CELL)
const ow = cols * (CELL * Z + GAP) + GAP
const oh = rows * (CELL * Z + GAP) + GAP
const data = new Uint8Array(ow * oh * 4)
for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 1] = 0; data[i + 2] = 255; data[i + 3] = 255 }
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const ox = GAP + c * (CELL * Z + GAP)
    const oy = GAP + r * (CELL * Z + GAP)
    for (let y = 0; y < CELL * Z; y++) {
      for (let x = 0; x < CELL * Z; x++) {
        const si = ((r * CELL + Math.floor(y / Z)) * img.width + c * CELL + Math.floor(x / Z)) * 4
        data.set(img.data.subarray(si, si + 4), ((oy + y) * ow + ox + x) * 4)
      }
    }
  }
}
const out: RgbaImage = { width: ow, height: oh, data }
writeFileSync(process.env['OUT']!, encodePng(out))
process.stdout.write(`grade ${cols}x${rows} células, saída ${ow}x${oh}\n`)
