import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractAll, itemFramePath, outfitFramePath } from '../src/extract.js'
import { decodePng } from '../src/png.js'
import type { Rgb } from '../src/spr.js'
import { buildDat, groundItemSpec, outfitSpec } from './fixtures/dat-fixture.js'
import { buildSpr, solidSprite } from './fixtures/spr-fixture.js'

const RED: Rgb = [255, 0, 0]

describe('extractAll', () => {
  it('escreve PNGs por outfit/direção/fase, por item, e o catalog.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-extract-'))
    const sprPath = join(dir, 'Tibia.spr')
    const datPath = join(dir, 'Tibia.dat')
    const outDir = join(dir, 'out')

    // 1 sprite vermelho; item 100 usa sprite 1; outfit 1 (2 fases, 32 ids) usa sprite 1 em tudo; outfit 2 é vazio
    await writeFile(sprPath, buildSpr([solidSprite(RED)]))
    const emptyOutfit = { ...outfitSpec(1, 0), spriteIds: Array.from({ length: 16 }, () => 0) }
    await writeFile(
      datPath,
      buildDat({
        items: [groundItemSpec(1)],
        outfits: [{ ...outfitSpec(2, 1), spriteIds: Array.from({ length: 32 }, () => 1) }, emptyOutfit],
      }),
    )

    const catalog = await extractAll({ sprPath, datPath, outDir, version: 860 })

    expect(catalog.outfits.map((o) => o.id)).toEqual([1])
    expect(catalog.outfits[0]).toMatchObject({ width: 2, height: 2, directions: 4, phases: 2 })
    expect(catalog.items[0]).toMatchObject({ id: 100, isGround: true, isBlocking: false })

    const png = decodePng(await readFile(outfitFramePath(outDir, 1, 'south', 1)))
    expect(png.width).toBe(64)
    expect(Array.from(png.data.subarray(0, 4))).toEqual([255, 0, 0, 255])

    const item = decodePng(await readFile(itemFramePath(outDir, 100, 0, 0)))
    expect(item.width).toBe(32)

    const written = JSON.parse(await readFile(join(outDir, 'catalog.json'), 'utf8'))
    expect(written.outfits).toHaveLength(1)
    expect(written.version).toBe(860)
  })
})
