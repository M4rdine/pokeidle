import { readFileSync } from 'node:fs'
import { decodePng } from '../src/png.js'
import { readWangGrid } from '../src/wang-grid.js'

const img = decodePng(readFileSync(process.argv[2]!))
const r = readWangGrid(img, { from: 'a', to: 'b' })
process.stdout.write(`cor from: ${r.fromColor.join(',')} | cor to: ${r.toColor.join(',')}\n`)
process.stdout.write(`códigos encontrados (${r.pieces.size}): ${[...r.pieces.keys()].sort().join(' ')}\n`)
process.stdout.write(`faltando (${r.missing.length}): ${r.missing.join(' ')}\n`)
