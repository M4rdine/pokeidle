import { access, copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { efeitoAnimName, projetilFrameName } from '@pokeidle/shared'
import { aoQuadradoNoGrupo } from './apertar-quadros.js'
import { packGrid, toTiledTileset, type AtlasFrame, type TerrainInput } from './atlas.js'
import type { Catalog, CatalogOutfit } from './catalog.js'
import { DIRECTION_NAMES, type RgbaImage } from './compose.js'
import { efeitoFramePath, itemFramePath, loadCatalog, outfitFramePath, projetilFramePath, type Logger } from './extract.js'
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
   * trabalho em `outDir` (com o `.tsj` que o Tiled usa) e publica aqui os arquivos da
   * allowlist. Sem isso a cópia servida congela na última vez que alguém lembrou de copiar à
   * mão, e o jogo desenha um mapa com metade dos tiles faltando.
   */
  readonly publishDir?: string | undefined
  /** Pasta dos conjuntos de terreno desenhados; padrão ao lado do manifesto. */
  readonly terrainsDir?: string
  /** Pasta dos props desenhados; padrão ao lado do manifesto. */
  readonly propsDir?: string
  /** Pasta dos mapas de caçada; é ela que decide o que o atlas publicado carrega. */
  readonly mapsDir?: string
}

/** Onde os mapas de caçada moram. */
const MAPAS_PADRAO = 'packages/shared/data/hunts'

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

/**
 * Confere que a extração escolhida tem os outfits que o manifest pede, ANTES de ler quadro nenhum.
 *
 * Sem isto a falha chegava como um `ENOENT` no meio da construção, apontando um caminho de PNG —
 * e a causa real (extração errada na linha de comando) não aparecia em lugar nenhum da mensagem.
 */
async function conferirExtracao(extractedDir: string, manifest: Manifest): Promise<void> {
  const faltando: string[] = []
  for (const species of manifest.species) {
    if (!(await exists(join(extractedDir, 'outfits', String(species.outfitId))))) {
      faltando.push(`${species.name} (outfit ${species.outfitId})`)
    }
  }
  if (faltando.length === 0) return
  throw new Error(
    `${faltando.length} de ${manifest.species.length} espécies não têm outfit em "${extractedDir}": ` +
    `${faltando.slice(0, 5).join(', ')}${faltando.length > 5 ? '…' : ''}. ` +
    'Esta extração não é a que o manifest usa — aponte a certa com --extracted.',
  )
}

async function pokemonFrames(extractedDir: string, manifest: Manifest, catalog: Catalog): Promise<AtlasFrame[]> {
  await conferirExtracao(extractedDir, manifest)
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
  /** Vai junto no `meta` da folha. É por onde a tabela de golpe por tipo chega ao cliente. */
  extraMeta?: Readonly<Record<string, unknown>>,
): Promise<ReturnType<typeof packGrid>> {
  const packed = packGrid(frames, `${baseName}.png`, 0, animations)
  const sheet = extraMeta === undefined ? packed.sheet : { ...packed.sheet, meta: { ...packed.sheet.meta, ...extraMeta } }
  await writeFile(join(outDir, `${baseName}.png`), encodePng(packed.image))
  await writeFile(join(outDir, `${baseName}.json`), JSON.stringify(sheet, null, 2))
  return packed
}

/**
 * Os quadros das ANIMAÇÕES DE GOLPE: o que viaja e o que estoura.
 *
 * O projétil tem OITO DIREÇÕES — o `.dat` guarda um padrão 3×3 e o cliente escolhe a célula pelo
 * sinal do deslocamento —, e o efeito tem fases. Por isso o projétil vira um quadro por direção e
 * o efeito vira uma animação, do mesmo jeito que um tile animado.
 *
 * Um id repetido entre tipos entra UMA VEZ: vários tipos podem compartilhar o mesmo estouro, e
 * empacotar o mesmo desenho duas vezes só engorda o que o navegador baixa.
 */
async function golpeFrames(
  extractedDir: string,
  golpes: NonNullable<Manifest['golpes']>,
  catalog: Catalog,
): Promise<{ frames: AtlasFrame[]; animations: Record<string, string[]> }> {
  const frames: AtlasFrame[] = []
  const animations: Record<string, string[]> = {}
  const feitos = new Set<string>()

  for (const g of golpes) {
    if (g.projetil !== undefined && !feitos.has(`p${g.projetil}`)) {
      feitos.add(`p${g.projetil}`)
      const info = catalog.missiles.find((m) => m.id === g.projetil)
      if (!info) throw new Error(`golpe ${g.type}: projétil ${g.projetil} não existe no catálogo`)
      for (let px = 0; px < info.directions; px++) {
        for (let py = 0; py < info.directions; py++) {
          const caminho = projetilFramePath(extractedDir, g.projetil, px, py)
          frames.push({ name: projetilFrameName(g.projetil, px, py), image: decodePng(await readFile(caminho)) })
        }
      }
    }
    if (g.efeito !== undefined && !feitos.has(`e${g.efeito}`)) {
      feitos.add(`e${g.efeito}`)
      const info = catalog.effects.find((e) => e.id === g.efeito)
      if (!info) throw new Error(`golpe ${g.type}: efeito ${g.efeito} não existe no catálogo`)
      const nomes: string[] = []
      for (let fase = 0; fase < info.phases; fase++) {
        const nome = `efeito-${g.efeito}-f${fase}`
        frames.push({ name: nome, image: decodePng(await readFile(efeitoFramePath(extractedDir, g.efeito, fase))) })
        nomes.push(nome)
      }
      animations[efeitoAnimName(g.efeito)] = nomes
    }
  }
  return { frames, animations }
}

export async function buildAtlases(opts: BuildOptions, log: Logger = () => {}): Promise<{ pokemonFrames: number; tileFrames: number }> {
  const [manifest, catalog] = await Promise.all([loadManifest(opts.manifestPath), loadCatalog(opts.extractedDir)])
  const problems = validateManifest(manifest, catalog)
  if (problems.length > 0) throw new Error(`manifest incoerente com o catálogo:\n${problems.join('\n')}`)
  if (manifest.species.length === 0) throw new Error('manifest sem espécies: adicione ao menos uma entrada em "species"')
  if (manifest.tiles.length === 0) throw new Error('manifest sem tiles: adicione ao menos uma entrada em "tiles"')

  await mkdir(opts.outDir, { recursive: true })
  /*
   * A grade é de células QUADRADAS, e todo consumidor escala o sprite pelo lado do quadro. Um PNG
   * de origem retangular entra com margem morta de um lado, e o bicho passa a ser desenhado menor
   * que os vizinhos e fora do centro — em silêncio, porque nada quebra.
   *
   * Foi assim que o Charmander, cujas folhas no dump têm 64×32 com o desenho na metade direita,
   * apareceu pela metade do tamanho dos outros dois na tela do inicial. O erro vinha da origem
   * desde a primeira construção do atlas, e nenhum teste o via.
   *
   * NORMALIZAR, E NÃO FALHAR. A primeira versão disto era um erro que parava o build — e travar a
   * construção inteira por uma margem morta que se corrige com geometria é transformar um
   * problema mecânico em bloqueio. Quem já é quadrado passa intacto.
   */
  const pokemon = aoQuadradoNoGrupo(await pokemonFrames(opts.extractedDir, manifest, catalog))
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

  const golpes = manifest.golpes ?? []
  if (golpes.length > 0) {
    const g = await golpeFrames(opts.extractedDir, golpes, catalog)
    await writeAtlas(opts.outDir, 'golpes', g.frames, g.animations, { golpes })
    log(`golpes.png: ${g.frames.length} quadros de ${golpes.length} tipo(s)`)
  }

  const publicado = await publishAtlas(opts, tiles, animations, log, golpes.length > 0)
  if (publicado !== null) log(`publicado para o servidor em ${publicado}`)

  return { pokemonFrames: pokemon.length, tileFrames: tiles.length }
}

/** Os arquivos que o servidor entrega; o `.tsj` é ferramenta e fica de fora. */
/**
 * Quantas das dezesseis peças o build aceita compor sozinho. O gerador costuma pular os códigos
 * em xadrez, e cinco é normal; mais da metade composta significa que a folha não é um conjunto de
 * terreno, e aceitar isso esconderia o problema atrás de peças inventadas.
 */
const MAX_SINTETIZADAS = 8

/** Lado do tile em pixels; o tamanho de um prop é sempre um múltiplo dele. */
const TILE = 32

/**
 * O que é copiado para a pasta servida, além do `tiles` que é podado à parte.
 *
 * `golpes` é CONDICIONAL: um manifest sem a tabela de animação não gera esses dois arquivos, e
 * copiá-los assim mesmo derrubava o build inteiro num `ENOENT`. O cliente já trata a ausência —
 * ele volta ao desenho genérico —, então faltar é um estado legítimo, não um erro.
 */
const PUBLICADOS = ['pokemon.png', 'pokemon.json'] as const
const PUBLICADOS_DE_GOLPE = ['golpes.png', 'golpes.json'] as const

/**
 * Os nomes de tile que os mapas de caçada realmente usam, já com as fases das animações.
 *
 * Um tile animado aparece no mapa pelo nome-base e a tabela de animação lista as fases; trazer só
 * a base deixaria a água parada no primeiro quadro.
 */
async function tilesUsadosPelosMapas(
  mapsDir: string,
  animations: Readonly<Record<string, readonly string[]>>,
): Promise<ReadonlySet<string>> {
  const usados = new Set<string>()
  for (const arquivo of await readdir(mapsDir)) {
    if (!arquivo.endsWith('.json')) continue
    const mapa = JSON.parse(await readFile(join(mapsDir, arquivo), 'utf8')) as {
      layers: Record<string, readonly (string | null)[] | undefined>
    }
    /*
     * SÓ AS CAMADAS DE TILE. `blocking` é um vetor de BOOLEANOS — percorrê-lo junto fazia "true" e
     * "false" entrarem como nomes de tile, e o guarda logo abaixo os acusou como faltando no
     * atlas. Nomear as camadas aqui é o que impede uma camada nova de vazar para cá sem pensar.
     */
    for (const camada of [mapa.layers['ground'], mapa.layers['detail'], mapa.layers['canopy']]) {
      for (const nome of camada ?? []) {
        if (nome === null) continue
        usados.add(nome)
        for (const fase of animations[nome] ?? []) usados.add(fase)
      }
    }
  }
  return usados
}

/**
 * Publica o atlas para o servidor — e o de TILES vai PODADO ao que os mapas usam.
 *
 * O manifest é a paleta do AUTOR: ele cresceu de 70 para 936 peças para que dê para desenhar mapa
 * no Tiled com o tileset do Tibia inteiro. O navegador não precisa de nada disso: ele precisa dos
 * tiles que os mapas de fato colocaram no chão.
 *
 * Sem a poda, importar a paleta levou `tiles.png` de 366 KB para 2,3 MB e `tiles.json` de 159 KB
 * para 1 MB — seis vezes mais bytes no caminho crítico da cena, para desenhar os mesmos dezesseis
 * mapas. O `.tsj` e o atlas cheio continuam em `outDir`, que é onde o Tiled lê.
 */
async function publishAtlas(
  opts: BuildOptions,
  tiles: readonly AtlasFrame[],
  animations: Readonly<Record<string, readonly string[]>>,
  log: Logger,
  temGolpes: boolean,
): Promise<string | null> {
  const publishDir = opts.publishDir
  if (publishDir === undefined) return null
  await mkdir(publishDir, { recursive: true })
  for (const nome of [...PUBLICADOS, ...(temGolpes ? PUBLICADOS_DE_GOLPE : [])]) {
    await copyFile(join(opts.outDir, nome), join(publishDir, nome))
  }

  const usados = await tilesUsadosPelosMapas(opts.mapsDir ?? MAPAS_PADRAO, animations)
  const podados = tiles.filter((f) => usados.has(f.name))
  /*
   * Um mapa que cita tile que o atlas não tem é erro de dado, e some calado: o quadro fica
   * transparente e ninguém procura o buraco. Aqui ele vira falha de build, que é onde dá para
   * consertar.
   */
  const semQuadro = [...usados].filter((n) => !tiles.some((f) => f.name === n))
  if (semQuadro.length > 0) {
    throw new Error(`${semQuadro.length} tile(s) usados por mapas não existem no atlas: ${semQuadro.slice(0, 5).join(', ')}`)
  }
  const animacoesPodadas = Object.fromEntries(
    Object.entries(animations).filter(([nome]) => usados.has(nome)),
  )
  await writeAtlas(publishDir, 'tiles', podados, animacoesPodadas)
  log(`publicado podado: ${podados.length} de ${tiles.length} quadros (só o que os mapas usam)`)
  return publishDir
}
