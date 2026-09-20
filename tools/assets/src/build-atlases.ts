import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { packGrid, toTiledTileset, type AtlasFrame, type TerrainInput } from './atlas.js'
import type { Catalog, CatalogOutfit } from './catalog.js'
import { DIRECTION_NAMES, type RgbaImage } from './compose.js'
import { itemFramePath, loadCatalog, outfitFramePath, type Logger } from './extract.js'
import { expandedTileNames, loadManifest, validateManifest, type Manifest, type SpeciesEntry, type TerrainSetEntry, type TileEntry, type TransitionEntry } from './manifest.js'
import { decodePng, encodePng } from './png.js'
import { isPhaseFrame, phaseFrameName, phaseFrameNames } from './tile-animation.js'
import { sliceImage } from './tile-slice.js'
import { transitionAnimations, transitionTerrain, transitionTiles } from './transition.js'
import { harmonize, type Rgb } from './harmonize.js'
import { readWangGrid } from './wang-grid.js'

export interface BuildOptions {
  readonly extractedDir: string
  readonly manifestPath: string
  readonly outDir: string
  /** Pasta dos conjuntos de terreno desenhados; padrão ao lado do manifesto. */
  readonly terrainsDir?: string
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/** Frames de todos os tiles, um por fase, mais a tabela de animação dos que têm mais de uma fase. */
async function tileFrames(
  extractedDir: string,
  tiles: readonly TileEntry[],
  catalog: Catalog,
): Promise<{ frames: AtlasFrame[]; animations: Record<string, string[]> }> {
  const frames: AtlasFrame[] = []
  const animations: Record<string, string[]> = {}
  for (const t of tiles) {
    const phases = catalog.items.find((i) => i.id === t.itemId)?.phases ?? 1
    const names = expandedTileNames(t)
    if (phases > 1) for (const name of names) animations[name] = phaseFrameNames(name, phases)
    for (let phase = 0; phase < phases; phase++) {
      const path = itemFramePath(extractedDir, t.itemId, t.patternX, t.patternY, phase)
      if (!(await exists(path))) {
        throw new Error(
          `tile ${t.name}: falta o quadro da fase ${phase} em ${path}; rode "pnpm assets extract" de novo para gravar as fases`,
        )
      }
      const pieces = sliceImage(decodePng(await readFile(path)), t.slice?.cols ?? 1, t.slice?.rows ?? 1)
      // `expandedTileNames` e `sliceImage` percorrem na mesma ordem de leitura.
      pieces.forEach((piece, i) => frames.push({ name: phaseFrameName(names[i]!, phase), image: piece }))
    }
  }
  return { frames, animations }
}

function findTileImage(frames: readonly AtlasFrame[], transitionName: string, tileName: string): RgbaImage {
  const frame = frames.find((f) => f.name === tileName)
  if (!frame) throw new Error(`transição ${transitionName}: tile "${tileName}" não está no atlas`)
  return frame.image
}

/** Todas as fases de um tile, na ordem, para compor a transição quadro a quadro. */
function tileImages(
  frames: readonly AtlasFrame[],
  transitionName: string,
  tileName: string,
  animations: Readonly<Record<string, readonly string[]>>,
): RgbaImage[] {
  const names = animations[tileName] ?? [tileName]
  return names.map((name) => findTileImage(frames, transitionName, name))
}

/** As peças mistas de cada transição, com os quadros de fase, e a tabela de animação delas. */
function transitionFrames(
  frames: readonly AtlasFrame[],
  transitions: readonly TransitionEntry[],
  animations: Readonly<Record<string, readonly string[]>>,
): { frames: AtlasFrame[]; animations: Record<string, string[]> } {
  const built = transitions.map((entry) => {
    const from = tileImages(frames, entry.name, entry.from, animations)
    const to = tileImages(frames, entry.name, entry.to, animations)
    return {
      tiles: transitionTiles(entry, { from, to }),
      anims: transitionAnimations(entry, Math.max(from.length, to.length)),
    }
  })
  return {
    frames: built.flatMap((b) => b.tiles),
    animations: Object.assign({}, ...built.map((b) => b.anims)) as Record<string, string[]>,
  }
}

/**
 * Conjuntos de terreno desenhados: cada PNG em grade vira dezesseis peças nomeadas e um pincel
 * completo. Um conjunto que não cobre os dezesseis códigos é recusado, porque o pincel ficaria
 * com buraco e o autor só descobriria pintando.
 */
async function terrainSetFrames(
  dir: string,
  sets: readonly TerrainSetEntry[],
): Promise<{ frames: AtlasFrame[]; terrains: TerrainInput[] }> {
  const frames: AtlasFrame[] = []
  const terrains: TerrainInput[] = []
  // Primeira aparição de um material define a cor que todos os conjuntos passam a usar. Sem isto,
  // quatro conjuntos de campo trazem quatro verdes e a grama muda de cor na emenda entre áreas.
  const canonical = new Map<string, Rgb>()
  for (const set of sets) {
    const path = join(dir, set.file)
    if (!(await exists(path))) throw new Error(`conjunto de terreno ${set.name}: arquivo não encontrado em ${path}`)
    const grid = readWangGrid(decodePng(await readFile(path)), set)
    if (grid.missing.length > 0) {
      throw new Error(
        `conjunto de terreno ${set.name}: faltam ${grid.missing.length} combinações de canto (${grid.missing.join(', ')}); regere o conjunto`,
      )
    }
    const shifts = [
      { nome: set.from, measured: grid.fromColor },
      { nome: set.to, measured: grid.toColor },
    ].map((m) => {
      const alvo = canonical.get(m.nome) ?? m.measured
      canonical.set(m.nome, alvo)
      return { measured: m.measured, canonical: alvo }
    })
    for (const [code, image] of grid.pieces) frames.push({ name: `${set.name}-${code}`, image: harmonize(image, shifts) })
    terrains.push({
      name: set.name,
      colors: [set.from, set.to],
      tiles: [...grid.pieces.keys()].map((code) => ({
        tile: `${set.name}-${code}`,
        corners: [...code].map((c) => (c === 'a' ? set.from : set.to)) as [string, string, string, string],
      })),
    })
  }
  return { frames, terrains }
}

async function writeAtlas(
  outDir: string,
  baseName: string,
  frames: readonly AtlasFrame[],
  animations?: Readonly<Record<string, readonly string[]>>,
): Promise<ReturnType<typeof packGrid>> {
  const packed = packGrid(frames, `${baseName}.png`, 0, animations)
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

  const base = await tileFrames(opts.extractedDir, manifest.tiles, catalog)
  const transitions = manifest.transitions ?? []
  const mixed = transitionFrames(base.frames, transitions, base.animations)
  const desenhados = await terrainSetFrames(
    opts.terrainsDir ?? join(opts.manifestPath, '..', 'terrenos'),
    manifest.terrainSets ?? [],
  )
  const tiles = [...base.frames, ...mixed.frames, ...desenhados.frames]
  const animations = { ...base.animations, ...mixed.animations }
  const packedTiles = await writeAtlas(opts.outDir, 'tiles', tiles, animations)
  const tileOrder = tiles.filter((f) => !isPhaseFrame(f.name)).map((f) => f.name)
  const terrains = [...(manifest.terrains ?? []), ...transitions.map(transitionTerrain), ...desenhados.terrains]
  await writeFile(
    join(opts.outDir, 'tiles.tsj'),
    JSON.stringify(toTiledTileset(packedTiles.sheet, 'tibia-tiles', tileOrder, terrains), null, 2),
  )
  log(`tiles.png: ${tileOrder.length} tiles em ${tiles.length} quadros; tiles.tsj pronto para o Tiled`)

  return { pokemonFrames: pokemon.length, tileFrames: tiles.length }
}
