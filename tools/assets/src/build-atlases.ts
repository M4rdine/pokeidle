import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { packGrid, toTiledTileset, type AtlasFrame } from './atlas.js'
import type { Catalog, CatalogOutfit } from './catalog.js'
import { DIRECTION_NAMES } from './compose.js'
import { itemFramePath, loadCatalog, outfitFramePath, type Logger } from './extract.js'
import { expandedTileNames, loadManifest, validateManifest, type Manifest, type SpeciesEntry, type TileEntry } from './manifest.js'
import { decodePng, encodePng } from './png.js'
import { sliceImage } from './tile-slice.js'

export interface BuildOptions {
  readonly extractedDir: string
  readonly manifestPath: string
  readonly outDir: string
}

async function readFrame(name: string, path: string): Promise<AtlasFrame> {
  return { name, image: decodePng(await readFile(path)) }
}

async function outfitFrames(extractedDir: string, species: SpeciesEntry, outfit: CatalogOutfit, action: string): Promise<AtlasFrame[]> {
  const frames: AtlasFrame[] = []
  for (const direction of DIRECTION_NAMES) {
    for (let phase = 0; phase < outfit.phases; phase++) {
      frames.push(await readFrame(`${species.name}/${action}_${direction}_${phase}`, outfitFramePath(extractedDir, outfit.id, direction, phase)))
    }
  }
  return frames
}

function findOutfit(catalog: Catalog, id: number): CatalogOutfit {
  const outfit = catalog.outfits.find((o) => o.id === id)
  if (!outfit) throw new Error(`outfit ${id} não está no catálogo`)
  return outfit
}

async function pokemonFrames(extractedDir: string, manifest: Manifest, catalog: Catalog): Promise<AtlasFrame[]> {
  const frames: AtlasFrame[] = []
  for (const species of manifest.species) {
    frames.push(...(await outfitFrames(extractedDir, species, findOutfit(catalog, species.outfitId), 'walk')))
    if (species.attackOutfitId !== undefined) {
      frames.push(...(await outfitFrames(extractedDir, species, findOutfit(catalog, species.attackOutfitId), 'attack')))
    }
  }
  return frames
}

async function tileFrames(extractedDir: string, tiles: readonly TileEntry[]): Promise<AtlasFrame[]> {
  const frames: AtlasFrame[] = []
  for (const t of tiles) {
    const image = decodePng(await readFile(itemFramePath(extractedDir, t.itemId, t.patternX, t.patternY)))
    const pieces = sliceImage(image, t.slice?.cols ?? 1, t.slice?.rows ?? 1)
    const names = expandedTileNames(t)
    // `expandedTileNames` e `sliceImage` percorrem na mesma ordem de leitura.
    pieces.forEach((piece, i) => frames.push({ name: names[i]!, image: piece }))
  }
  return frames
}

async function writeAtlas(outDir: string, baseName: string, frames: readonly AtlasFrame[]): Promise<ReturnType<typeof packGrid>> {
  const packed = packGrid(frames, `${baseName}.png`)
  await writeFile(join(outDir, `${baseName}.png`), encodePng(packed.image))
  await writeFile(join(outDir, `${baseName}.json`), JSON.stringify(packed.sheet, null, 2))
  return packed
}

export async function buildAtlases(opts: BuildOptions, log: Logger = () => {}): Promise<{ pokemonFrames: number; tileFrames: number }> {
  const [manifest, catalog] = await Promise.all([loadManifest(opts.manifestPath), loadCatalog(opts.extractedDir)])
  const problems = validateManifest(manifest, catalog)
  if (problems.length > 0) throw new Error(`manifest incoerente com o catálogo:\n${problems.join('\n')}`)
  if (manifest.species.length === 0) throw new Error('manifest sem espécies: adicione ao menos uma entrada em "species"')
  if (manifest.tiles.length === 0) throw new Error('manifest sem tiles: adicione ao menos uma entrada em "tiles"')

  await mkdir(opts.outDir, { recursive: true })
  const pokemon = await pokemonFrames(opts.extractedDir, manifest, catalog)
  await writeAtlas(opts.outDir, 'pokemon', pokemon)
  log(`pokemon.png: ${pokemon.length} frames de ${manifest.species.length} espécies`)

  const tiles = await tileFrames(opts.extractedDir, manifest.tiles)
  const packedTiles = await writeAtlas(opts.outDir, 'tiles', tiles)
  const tileOrder = tiles.map((f) => f.name)
  await writeFile(
    join(opts.outDir, 'tiles.tsj'),
    JSON.stringify(toTiledTileset(packedTiles.sheet, 'tibia-tiles', tileOrder, manifest.terrains ?? []), null, 2),
  )
  log(`tiles.png: ${tiles.length} tiles; tiles.tsj pronto para o Tiled`)

  return { pokemonFrames: pokemon.length, tileFrames: tiles.length }
}
