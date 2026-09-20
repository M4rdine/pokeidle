import { readFileSync, writeFileSync } from 'node:fs'
import { removeFlatBackground, trimTransparent } from '../src/background.js'
import { decodePng, encodePng } from '../src/png.js'
import type { RgbaImage } from '../src/compose.js'

/** Folha de aprovação de props: cada peça recortada, sobre xadrez, onde halo aparece na hora. */
const paths = process.argv.slice(2)
const SIZE = Number(process.env['SIZE'] ?? 64)
const Z = Number(process.env['Z'] ?? 3)
const GAP = 8
const cols = Math.min(paths.length, Number(process.env['COLS'] ?? 6))
const rows = Math.ceil(paths.length / cols)
const cell = SIZE * Z
const ow = cols * (cell + GAP) + GAP
const oh = rows * (cell + GAP) + GAP
const data = new Uint8Array(ow * oh * 4)
// Xadrez de fundo
for (let y = 0; y < oh; y++) {
  for (let x = 0; x < ow; x++) {
    const v = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 210 : 160
    const i = (y * ow + x) * 4
    data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255
  }
}
paths.forEach((p, idx) => {
  const recortado: RgbaImage = trimTransparent(removeFlatBackground(decodePng(readFileSync(p))), SIZE)
  const ox = GAP + (idx % cols) * (cell + GAP)
  const oy = GAP + Math.floor(idx / cols) * (cell + GAP)
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const si = (Math.floor(y / Z) * recortado.width + Math.floor(x / Z)) * 4
      if (recortado.data[si + 3] === 0) continue
      data.set(recortado.data.subarray(si, si + 4), ((oy + y) * ow + ox + x) * 4)
    }
  }
})
writeFileSync(process.env['OUT']!, encodePng({ width: ow, height: oh, data }))
process.stdout.write(`folha de props: ${paths.length} peças\n`)
