import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildAtlases } from '../src/build-atlases.js'
import type { Catalog } from '../src/catalog.js'
import { itemFramePath, outfitFramePath } from '../src/extract.js'
import { decodePng, encodePng } from '../src/png.js'

const catalog: Catalog = {
  version: 860,
  sprSignature: 1,
  datSignature: 2,
  outfits: [{ id: 10, width: 2, height: 2, directions: 4, phases: 2, layers: 1, displacement: { x: 8, y: 8 } }],
  items: [{ id: 100, width: 1, height: 1, patternX: 1, patternY: 1, phases: 1, isGround: true, isBlocking: false }],
}

async function writePng(path: string, w: number, h: number, v: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, encodePng({ width: w, height: h, data: new Uint8Array(w * h * 4).fill(v) }))
}

describe('buildAtlases', () => {
  it('gera pokemon e tiles com nomes de frame e animações', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-atlas-'))
    const extractedDir = join(dir, 'extracted')
    const outDir = join(dir, 'atlas')
    await mkdir(extractedDir, { recursive: true })
    await writeFile(join(extractedDir, 'catalog.json'), JSON.stringify(catalog))
    for (const d of ['north', 'east', 'south', 'west']) {
      for (const phase of [0, 1]) await writePng(outfitFramePath(extractedDir, 10, d, phase), 64, 64, 200)
    }
    await writePng(itemFramePath(extractedDir, 100, 0, 0), 32, 32, 90)
    const manifestPath = join(dir, 'manifest.json')
    await writeFile(
      manifestPath,
      JSON.stringify({ version: 1, species: [{ id: 1, name: 'bulbasaur', outfitId: 10 }], tiles: [{ name: 'grass', itemId: 100 }] }),
    )

    const result = await buildAtlases({ extractedDir, manifestPath, outDir })
    expect(result).toEqual({ pokemonFrames: 8, tileFrames: 1 })

    const pokemon = JSON.parse(await readFile(join(outDir, 'pokemon.json'), 'utf8'))
    expect(pokemon.frames['bulbasaur/walk_south_1']).toBeDefined()
    expect(pokemon.animations['bulbasaur/walk_south']).toEqual(['bulbasaur/walk_south_0', 'bulbasaur/walk_south_1'])
    expect(pokemon.meta.image).toBe('pokemon.png')
    const img = decodePng(await readFile(join(outDir, 'pokemon.png')))
    expect(img.width).toBe(3 * 64)

    const tiles = JSON.parse(await readFile(join(outDir, 'tiles.json'), 'utf8'))
    expect(tiles.frames['grass'].frame).toEqual({ x: 0, y: 0, w: 32, h: 32 })
    const tsj = JSON.parse(await readFile(join(outDir, 'tiles.tsj'), 'utf8'))
    expect(tsj.tiles[0].properties[0].value).toBe('grass')
  })

  it('falha listando problemas de validação', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-atlas-'))
    const extractedDir = join(dir, 'extracted')
    await mkdir(extractedDir, { recursive: true })
    await writeFile(join(extractedDir, 'catalog.json'), JSON.stringify(catalog))
    const manifestPath = join(dir, 'manifest.json')
    await writeFile(manifestPath, JSON.stringify({ version: 1, species: [{ id: 1, name: 'x', outfitId: 999 }], tiles: [] }))
    await expect(buildAtlases({ extractedDir, manifestPath, outDir: join(dir, 'atlas') })).rejects.toThrow(/outfit 999/)
  })
})
