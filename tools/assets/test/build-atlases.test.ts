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
  extended: false,
  sprSignature: 1,
  datSignature: 2,
  outfits: [
    { id: 10, width: 2, height: 2, directions: 4, phases: 2, layers: 1, displacement: { x: 8, y: 8 } },
    { id: 11, width: 2, height: 2, directions: 4, phases: 1, layers: 1, displacement: { x: 8, y: 8 } },
  ],
  items: [
    { id: 100, width: 1, height: 1, patternX: 1, patternY: 1, phases: 1, isGround: true, isBlocking: false },
    { id: 101, width: 2, height: 2, patternX: 1, patternY: 1, phases: 1, isGround: false, isBlocking: true },
    { id: 102, width: 1, height: 1, patternX: 1, patternY: 1, phases: 1, isGround: true, isBlocking: false },
    { id: 103, width: 1, height: 1, patternX: 1, patternY: 1, phases: 3, isGround: true, isBlocking: false },
  ],
}

async function writePng(path: string, w: number, h: number, v: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, encodePng({ width: w, height: h, data: new Uint8Array(w * h * 4).fill(v) }))
}

/** Cor do PNG do item 100, usada tanto na fixture quanto nas asserções de quadrante. */
const GRASS_COLOR = 90

async function setupFixtures(): Promise<{ dir: string; extractedDir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'pokeidle-atlas-'))
  const extractedDir = join(dir, 'extracted')
  await mkdir(extractedDir, { recursive: true })
  await writeFile(join(extractedDir, 'catalog.json'), JSON.stringify(catalog))
  for (const d of ['north', 'east', 'south', 'west']) {
    for (const phase of [0, 1]) await writePng(outfitFramePath(extractedDir, 10, d, phase), 64, 64, 200)
    await writePng(outfitFramePath(extractedDir, 11, d, 0), 64, 64, 150)
  }
  await writePng(itemFramePath(extractedDir, 100, 0, 0), 32, 32, GRASS_COLOR)
  await writePng(itemFramePath(extractedDir, 101, 0, 0), 64, 64, 90)
  return { dir, extractedDir }
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

  it('gera frames e animação de ataque quando a espécie tem attackOutfitId', async () => {
    const { dir, extractedDir } = await setupFixtures()
    const outDir = join(dir, 'atlas')
    const manifestPath = join(dir, 'manifest.json')
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        species: [{ id: 1, name: 'bulbasaur', outfitId: 10, attackOutfitId: 11 }],
        tiles: [{ name: 'grass', itemId: 100 }],
      }),
    )

    const result = await buildAtlases({ extractedDir, manifestPath, outDir })
    expect(result).toEqual({ pokemonFrames: 12, tileFrames: 1 })

    const pokemon = JSON.parse(await readFile(join(outDir, 'pokemon.json'), 'utf8'))
    expect(pokemon.frames['bulbasaur/attack_south_0']).toBeDefined()
    expect(pokemon.frames['bulbasaur/attack_west_0']).toBeDefined()
    expect(pokemon.animations['bulbasaur/attack_south']).toEqual(['bulbasaur/attack_south_0'])
  })

  it('item grande vira uma peça por tile, cada uma 32×32', async () => {
    const { dir, extractedDir } = await setupFixtures()
    const manifestPath = join(dir, 'manifest.json')
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        species: [{ id: 1, name: 'bulbasaur', outfitId: 10 }],
        tiles: [
          { name: 'grass', itemId: 100 },
          { name: 'pokecenter', itemId: 101, slice: { cols: 2, rows: 2 } },
        ],
      }),
    )
    const outDir = join(dir, 'atlas')
    const result = await buildAtlases({ extractedDir, manifestPath, outDir })
    expect(result.tileFrames).toBe(5)
    const sheet = JSON.parse(await readFile(join(outDir, 'tiles.json'), 'utf8')) as {
      frames: Record<string, { frame: { w: number; h: number } }>
    }
    expect(Object.keys(sheet.frames)).toEqual(['grass', 'pokecenter-x0-y0', 'pokecenter-x1-y0', 'pokecenter-x0-y1', 'pokecenter-x1-y1'])
    expect(Object.values(sheet.frames).every((f) => f.frame.w === 32 && f.frame.h === 32)).toBe(true)
    const tileset = JSON.parse(await readFile(join(outDir, 'tiles.tsj'), 'utf8')) as { tilecount: number }
    // 5 quadros numa grade de 3x2: a célula sobrando também conta, porque é assim que o Tiled
    // numera um tileset de imagem, e é esse número que precisa bater com o que ele grava.
    expect(tileset.tilecount).toBe(6)
  })

  it('uma transição gera as catorze peças mistas e o terreno correspondente', async () => {
    const { dir, extractedDir } = await setupFixtures()
    const manifestPath = join(dir, 'manifest.json')
    // grass (item 100) e dirt (item 102) são PNGs de cores distintas: só assim a peça composta
    // "baaa" prova que ela de fato mistura os dois materiais, em vez de colar a mesma imagem
    // duas vezes (o que passaria mesmo se composeTransition ignorasse um dos dois tiles).
    const DIRT_COLOR = 210
    await writePng(itemFramePath(extractedDir, 102, 0, 0), 32, 32, DIRT_COLOR)
    await writeFile(manifestPath, JSON.stringify({
      version: 1,
      species: [{ id: 1, name: 'bulbasaur', outfitId: 10 }],
      tiles: [{ name: 'grass', itemId: 100 }, { name: 'dirt', itemId: 102 }],
      transitions: [{ name: 'grama-terra', from: 'grass', to: 'dirt' }],
    }))
    const outDir = join(dir, 'atlas')
    await buildAtlases({ extractedDir, manifestPath, outDir })
    const sheet = JSON.parse(await readFile(join(outDir, 'tiles.json'), 'utf8')) as {
      frames: Record<string, { frame: { x: number; y: number; w: number; h: number } }>
    }
    const names = Object.keys(sheet.frames)
    expect(names).toContain('grama-terra-abba')
    expect(names.filter((n) => n.startsWith('grama-terra-'))).toHaveLength(14) // 16 menos as duas puras
    const tileset = JSON.parse(await readFile(join(outDir, 'tiles.tsj'), 'utf8')) as { wangsets?: { name: string; wangtiles: unknown[] }[] }
    const wangset = tileset.wangsets?.find((w) => w.name === 'grama-terra')
    expect(wangset?.wangtiles).toHaveLength(16) // as catorze mistas mais as duas puras

    // "baaa": só o quadrante superior-direito é o material "b" (dirt); os outros três são "a" (grass).
    // Pontos bem no interior de cada quadrante (longe das bordas com ruído) provam a mistura peça a peça.
    const bordersPiece = sheet.frames['grama-terra-baaa']!.frame
    const tiles = decodePng(await readFile(join(outDir, 'tiles.png')))
    const pixelAt = (dx: number, dy: number): number => {
      const i = ((bordersPiece.y + dy) * tiles.width + bordersPiece.x + dx) * 4
      return tiles.data[i]!
    }
    expect(pixelAt(28, 3)).toBe(DIRT_COLOR) // superior-direito ("b")
    expect(pixelAt(28, 28)).toBe(GRASS_COLOR) // inferior-direito ("a")
    expect(pixelAt(3, 28)).toBe(GRASS_COLOR) // inferior-esquerdo ("a")
    expect(pixelAt(3, 3)).toBe(GRASS_COLOR) // superior-esquerdo ("a")
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

  it('falha quando o manifest não tem tiles', async () => {
    const { dir, extractedDir } = await setupFixtures()
    const manifestPath = join(dir, 'manifest.json')
    await writeFile(manifestPath, JSON.stringify({ version: 1, species: [{ id: 1, name: 'bulbasaur', outfitId: 10 }], tiles: [] }))
    await expect(buildAtlases({ extractedDir, manifestPath, outDir: join(dir, 'atlas') })).rejects.toThrow(/manifest sem tiles/)
  })

  it('falha quando o manifest não tem espécies', async () => {
    const { dir, extractedDir } = await setupFixtures()
    const manifestPath = join(dir, 'manifest.json')
    await writeFile(manifestPath, JSON.stringify({ version: 1, species: [], tiles: [{ name: 'grass', itemId: 100 }] }))
    await expect(buildAtlases({ extractedDir, manifestPath, outDir: join(dir, 'atlas') })).rejects.toThrow(/manifest sem espécies/)
  })
  it('um tile animado gera um quadro por fase, declara a animação e fica com uma entrada só no tileset', async () => {
    const { dir, extractedDir } = await setupFixtures()
    const manifestPath = join(dir, 'manifest.json')
    // o item 103 tem 3 fases no catálogo do fixture; grava os três PNGs
    await writePng(itemFramePath(extractedDir, 103, 0, 0), 32, 32, 10)
    await writePng(itemFramePath(extractedDir, 103, 0, 0, 1), 32, 32, 20)
    await writePng(itemFramePath(extractedDir, 103, 0, 0, 2), 32, 32, 30)
    await writeFile(manifestPath, JSON.stringify({
      version: 1,
      species: [{ id: 1, name: 'bulbasaur', outfitId: 10 }],
      tiles: [{ name: 'grass', itemId: 100 }, { name: 'water', itemId: 103 }],
    }))

    await buildAtlases({ extractedDir, manifestPath, outDir: dir }, () => {})

    const sheet = JSON.parse(await readFile(join(dir, 'tiles.json'), 'utf8'))
    expect(Object.keys(sheet.frames).sort()).toEqual(['grass', 'water', 'water_1', 'water_2'])
    expect(sheet.animations).toEqual({ water: ['water', 'water_1', 'water_2'] })

    const tileset = JSON.parse(await readFile(join(dir, 'tiles.tsj'), 'utf8'))
    expect(tileset.tiles.map((t: { properties: { value: string }[] }) => t.properties[0]!.value)).toEqual(['grass', 'water'])
  })

  it('avisa qual quadro de fase falta quando a extração é antiga', async () => {
    const { dir, extractedDir } = await setupFixtures()
    const manifestPath = join(dir, 'manifest.json')
    // só a fase 0 existe; o item 103 declara 3 fases no catálogo
    await writePng(itemFramePath(extractedDir, 103, 0, 0), 32, 32, 10)
    await writeFile(manifestPath, JSON.stringify({
      version: 1,
      species: [{ id: 1, name: 'bulbasaur', outfitId: 10 }],
      tiles: [{ name: 'water', itemId: 103 }],
    }))

    await expect(buildAtlases({ extractedDir, manifestPath, outDir: dir }, () => {})).rejects.toThrow(
      /tile water: falta o quadro da fase 1[\s\S]*pnpm assets extract/,
    )
  })

  it('transição com um lado animado sai com os quadros do lado animado', async () => {
    const { dir, extractedDir } = await setupFixtures()
    const manifestPath = join(dir, 'manifest.json')
    await writePng(itemFramePath(extractedDir, 103, 0, 0), 32, 32, 10)
    await writePng(itemFramePath(extractedDir, 103, 0, 0, 1), 32, 32, 20)
    await writePng(itemFramePath(extractedDir, 103, 0, 0, 2), 32, 32, 30)
    await writeFile(manifestPath, JSON.stringify({
      version: 1,
      species: [{ id: 1, name: 'bulbasaur', outfitId: 10 }],
      tiles: [{ name: 'grass', itemId: 100 }, { name: 'water', itemId: 103 }],
      transitions: [{ name: 'grama-agua', from: 'grass', to: 'water' }],
    }))

    await buildAtlases({ extractedDir, manifestPath, outDir: dir }, () => {})

    const sheet = JSON.parse(await readFile(join(dir, 'tiles.json'), 'utf8'))
    expect(sheet.frames['grama-agua-baaa_2']).toBeDefined()
    expect(sheet.animations['grama-agua-baaa']).toEqual(['grama-agua-baaa', 'grama-agua-baaa_1', 'grama-agua-baaa_2'])

    const tileset = JSON.parse(await readFile(join(dir, 'tiles.tsj'), 'utf8'))
    const names = tileset.tiles.map((t: { properties: { value: string }[] }) => t.properties[0]!.value)
    expect(names).toContain('grama-agua-baaa')
    expect(names).not.toContain('grama-agua-baaa_1')
  })

})
