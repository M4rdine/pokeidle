import { readFileSync, writeFileSync } from 'node:fs'
import { decodePng, encodePng } from '../src/png.js'

const sheet = JSON.parse(readFileSync('assets/atlas/tiles.json', 'utf8')) as {
  frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>
}
const atlas = decodePng(readFileSync('assets/atlas/tiles.png'))
const names = process.argv.slice(2)
const Z = 4
const COLS = Number(process.env['COLS'] ?? 8)
const CELL = 32 * Z
const GAP = 6
const rows = Math.ceil(names.length / COLS)
const ow = COLS * (CELL + GAP)
const oh = rows * (CELL + GAP)
const data = new Uint8Array(ow * oh * 4).fill(40)
names.forEach((name, idx) => {
  const f = sheet.frames[name]?.frame
  if (!f) return
  const ox = (idx % COLS) * (CELL + GAP)
  const oy = Math.floor(idx / COLS) * (CELL + GAP)
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const si = ((f.y + Math.floor(y / Z)) * atlas.width + f.x + Math.floor(x / Z)) * 4
      if (atlas.data[si + 3] === 0) continue
      const di = ((oy + y) * ow + ox + x) * 4
      data.set(atlas.data.subarray(si, si + 4), di)
    }
  }
})
writeFileSync(process.env['OUT']!, encodePng({ width: ow, height: oh, data }))
process.stdout.write(`ok ${ow}x${oh} (${names.length} tiles, ${COLS} por linha)\n`)
