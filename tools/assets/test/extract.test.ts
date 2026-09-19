import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractAll, itemFramePath, loadCatalog, outfitFramePath } from '../src/extract.js'
import { decodePng } from '../src/png.js'
import type { Rgb } from '../src/spr.js'
import { buildDat, groundItemSpec, outfitSpec } from './fixtures/dat-fixture.js'
import { buildSpr, solidSprite } from './fixtures/spr-fixture.js'

const RED: Rgb = [255, 0, 0]
const GREEN: Rgb = [0, 255, 0]

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
    expect(catalog.extended).toBe(false)

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

    await expect(loadCatalog(outDir)).resolves.toEqual(catalog)
  })

  it('grava um PNG por fase do item, com a fase 0 no caminho antigo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-extract-fases-'))
    const sprPath = join(dir, 'Tibia.spr')
    const datPath = join(dir, 'Tibia.dat')
    const outDir = join(dir, 'out')

    // dois sprites de cores diferentes; o item 100 tem 3 fases e usa um sprite por fase
    await writeFile(sprPath, buildSpr([solidSprite(RED), solidSprite(GREEN)]))
    const animated = { ...groundItemSpec(1), phases: 3, spriteIds: [1, 2, 1] }
    await writeFile(datPath, buildDat({ items: [animated], outfits: [] }))

    const catalog = await extractAll({ sprPath, datPath, outDir, version: 860 })
    expect(catalog.items[0]).toMatchObject({ id: 100, phases: 3 })

    const phase0 = decodePng(await readFile(itemFramePath(outDir, 100, 0, 0)))
    const phase1 = decodePng(await readFile(itemFramePath(outDir, 100, 0, 0, 1)))
    const phase2 = decodePng(await readFile(itemFramePath(outDir, 100, 0, 0, 2)))
    expect(Array.from(phase0.data.subarray(0, 4))).toEqual([255, 0, 0, 255])
    expect(Array.from(phase1.data.subarray(0, 4))).toEqual([0, 255, 0, 255])
    expect(Array.from(phase2.data.subarray(0, 4))).toEqual([255, 0, 0, 255])
  })

  it('loadCatalog rejeita catalog.json inválido', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-catalog-'))
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'catalog.json'), JSON.stringify({ version: 860, outfits: 'nope' }))

    await expect(loadCatalog(dir)).rejects.toThrow(/catalog.json inválido/)
  })
})
