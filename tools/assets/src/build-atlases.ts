import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { packGrid, toTiledTileset, type AtlasFrame, type TerrainInput } from './atlas.js'
import type { Catalog, CatalogOutfit } from './catalog.js'
import { DIRECTION_NAMES, type RgbaImage } from './compose.js'
import { itemFramePath, loadCatalog, outfitFramePath, type Logger } from './extract.js'
import { expandedTileNames, loadManifest, validateManifest, type Manifest, type PropEntry, type SpeciesEntry, type TerrainSetEntry, type TileEntry, type TransitionEntry } from './manifest.js'
import { decodePng, encodePng } from './png.js'
import { isPhaseFrame, phaseFrameName, phaseFrameNames } from './tile-animation.js'
import { sliceImage, sliceName } from './tile-slice.js'
import { transitionAnimations, transitionTerrain, transitionTiles } from './transition.js'
import { removeFlatBackground, trimTransparent } from './background.js'
import { harmonize, type Rgb } from './harmonize.js'
import { readWangGrid } from './wang-grid.js'

export interface BuildOptions {
  readonly extractedDir: string
  readonly manifestPath: string
  readonly outDir: string
  /**
   * Para onde publicar a cópia que o servidor entrega ao navegador. O build escreve o atlas de
   * trabalho em `outDir` (com o `.tsj` que o Tiled usa) e publica aqui os quatro arquivos da
   * allowlist. Sem isso a cópia servida congela na última vez que alguém lembrou de copiar à
   * mão, e o jogo desenha um mapa com metade dos tiles faltando.
   */
  readonly publishDir?: string | undefined
  /** Pasta dos conjuntos de terreno desenhados; padrão ao lado do manifesto. */
  readonly terrainsDir?: string
  /** Pasta dos props desenhados; padrão ao lado do manifesto. */
  readonly propsDir?: string
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

/** Os dois códigos de canto puros: 'aaaa' é o primeiro material do conjunto, 'bbbb' o segundo. */
const PURE_CODES = ['aaaa', 'bbbb'] as const
const PURE_CODE = { from: 'aaaa', to: 'bbbb' } as const
/** Teto de quadros extras por peça pura: mais que isto só engorda o atlas. */
const MAX_PURE_EXTRAS = 3

/** Descarta imagens repetidas pixel a pixel, preservando a ordem da primeira aparição. */
function distinctImages(images: readonly RgbaImage[]): RgbaImage[] {
  const vistas = new Set<string>()
  return images.filter((img) => {
    const chave = `${img.width}x${img.height}:${Buffer.from(img.data).toString('base64')}`
    if (vistas.has(chave)) return false
    vistas.add(chave)
    return true
  })
}

/**
 * Conjuntos de terreno desenhados: cada PNG em grade vira dezesseis peças nomeadas e um pincel
 * completo. Um conjunto que não cobre os dezesseis códigos é recusado, porque o pincel ficaria
 * com buraco e o autor só descobriria pintando.
 */
async function terrainSetFrames(
  dir: string,
  sets: readonly TerrainSetEntry[],
  log: Logger,
): Promise<{ frames: AtlasFrame[]; terrains: TerrainInput[]; animations: Record<string, string[]> }> {
  const frames: AtlasFrame[] = []
  const terrains: TerrainInput[] = []
  const animations: Record<string, string[]> = {}
  // Primeira aparição de um material define a cor que todos os conjuntos passam a usar. Sem isto,
  // quatro conjuntos de campo trazem quatro verdes e a grama muda de cor na emenda entre áreas.
  const canonical = new Map<string, Rgb>()
  for (const set of sets) {
    const path = join(dir, set.file)
    if (!(await exists(path))) throw new Error(`conjunto de terreno ${set.name}: arquivo não encontrado em ${path}`)
    const grid = readWangGrid(decodePng(await readFile(path)), set)
    if (grid.synthesized.length > MAX_SINTETIZADAS) {
      throw new Error(
        `conjunto de terreno ${set.name}: faltam ${grid.synthesized.length} das 16 combinações de canto (${grid.synthesized.join(', ')}); isto não é um conjunto de terreno, regere`,
      )
    }
    if (grid.synthesized.length > 0) {
      // Não é erro: o gerador raramente entrega os códigos em xadrez, e o build os compõe das
      // peças puras. Mas é peça inventada, então sai no log — quem cura decide se aceita.
      log(`  ${set.name}: ${grid.synthesized.length} peça(s) composta(s) — ${grid.synthesized.join(', ')}`)
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
    const codigoAnimado = set.animate === undefined ? null : PURE_CODE[set.animate]
    for (const code of PURE_CODES) {
      const base = `${set.name}-${code}`
      // Repetição idêntica não é variação nem fase: no conjunto de caverna duas células puras
      // saíram iguais pixel a pixel, e emiti-las dobrava o peso sem mudar nada na tela.
      const extras = distinctImages((grid.variants.get(code) ?? []).slice(1)).slice(0, MAX_PURE_EXTRAS)
      if (code === codigoAnimado) {
        // Fases: o cliente alterna os quadros no mesmo relógio da água do dump.
        extras.forEach((image, i) => frames.push({ name: phaseFrameName(base, i + 1), image: harmonize(image, shifts) }))
        if (extras.length > 0) animations[base] = phaseFrameNames(base, extras.length + 1)
        continue
      }
      // Variações: campo grande com um tile só fica chapado e denuncia repetição.
      extras.forEach((image, i) => frames.push({ name: `${base}-v${i + 2}`, image: harmonize(image, shifts) }))
    }
    terrains.push({
      name: set.name,
      colors: [set.from, set.to],
      tiles: [...grid.pieces.keys()].map((code) => ({
        tile: `${set.name}-${code}`,
        corners: [...code].map((c) => (c === 'a' ? set.from : set.to)) as [string, string, string, string],
      })),
    })
  }
  return { frames, terrains, animations }
}

/**
 * Props desenhados: recorta o fundo chapado, apara, centraliza e — quando ocupa dois tiles —
 * fatia em peças de 32, no mesmo padrão de nome dos itens grandes do dump.
 */
async function propFrames(dir: string, props: readonly PropEntry[]): Promise<AtlasFrame[]> {
  const frames: AtlasFrame[] = []
  for (const prop of props) {
    const path = join(dir, prop.file)
    if (!(await exists(path))) throw new Error(`prop ${prop.name}: arquivo não encontrado em ${path}`)
    const recortado = trimTransparent(
      removeFlatBackground(decodePng(await readFile(path)), prop.tolerance),
      prop.size,
    )
    const lado = prop.size / TILE
    if (lado === 1) {
      // Um tile só não ganha sufixo: quem posiciona usa o nome direto, e inventar `-x0-y0` aqui
      // obrigaria todo chamador a saber o tamanho do prop antes de nomeá-lo.
      frames.push({ name: prop.name, image: recortado })
      continue
    }
    sliceImage(recortado, lado, lado).forEach((image, i) => {
      frames.push({ name: sliceName(prop.name, i % lado, Math.floor(i / lado)), image })
    })
  }
  return frames
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
    log,
  )
  const props = await propFrames(opts.propsDir ?? join(opts.manifestPath, '..', 'props'), manifest.props ?? [])
  const tiles = [...base.frames, ...mixed.frames, ...desenhados.frames, ...props]
  const animations = { ...base.animations, ...mixed.animations, ...desenhados.animations }
  const packedTiles = await writeAtlas(opts.outDir, 'tiles', tiles, animations)
  const tileOrder = tiles.filter((f) => !isPhaseFrame(f.name)).map((f) => f.name)
  const terrains = [...(manifest.terrains ?? []), ...transitions.map(transitionTerrain), ...desenhados.terrains]
  await writeFile(
    join(opts.outDir, 'tiles.tsj'),
    JSON.stringify(toTiledTileset(packedTiles.sheet, 'tibia-tiles', tileOrder, terrains), null, 2),
  )
  log(`tiles.png: ${tileOrder.length} tiles em ${tiles.length} quadros; tiles.tsj pronto para o Tiled`)

  const publicado = await publishAtlas(opts.outDir, opts.publishDir)
  if (publicado !== null) log(`publicado para o servidor em ${publicado}`)

  return { pokemonFrames: pokemon.length, tileFrames: tiles.length }
}

/** Os quatro arquivos que o servidor entrega; o `.tsj` é ferramenta e fica de fora. */
/**
 * Quantas das dezesseis peças o build aceita compor sozinho. O gerador costuma pular os códigos
 * em xadrez, e cinco é normal; mais da metade composta significa que a folha não é um conjunto de
 * terreno, e aceitar isso esconderia o problema atrás de peças inventadas.
 */
const MAX_SINTETIZADAS = 8

/** Lado do tile em pixels; o tamanho de um prop é sempre um múltiplo dele. */
const TILE = 32

const PUBLICADOS = ['tiles.png', 'tiles.json', 'pokemon.png', 'pokemon.json'] as const

/**
 * Copia o atlas recém-gerado para a pasta que o servidor serve. Devolve o destino, ou null quando
 * não há destino configurado.
 */
async function publishAtlas(outDir: string, publishDir: string | undefined): Promise<string | null> {
  if (publishDir === undefined) return null
  await mkdir(publishDir, { recursive: true })
  for (const nome of PUBLICADOS) {
    await copyFile(join(outDir, nome), join(publishDir, nome))
  }
  return publishDir
}
