import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Command } from 'commander'
import { loadRegistry, parseHuntMap } from '@pokeidle/shared'
import { buildAtlases } from './build-atlases.js'
import { parseDat, type DatVersion } from './dat.js'
import { extractAll } from './extract.js'
import { readJson } from './json-file.js'
import { loadManifest } from './manifest.js'
import { loadTilesAtlas, renderMapPreview } from './map-preview.js'
import { parseSpr } from './spr.js'
import { encodePng } from './png.js'
import type { PixiSpritesheet } from './atlas.js'
import { renderTilesetSheet, writeContactSheet } from './contact-sheet.js'
import { importTiledMap, parseTiledTileset, type ImportOptions } from './tiled-import.js'

const out = (line: string): void => void process.stdout.write(`${line}\n`)

export function parseVersion(raw: string): DatVersion {
  if (raw === '860') return 860
  if (raw === '854') return 854
  throw new Error(`versão de .dat não suportada: ${raw} (use 860 ou 854)`)
}

async function importOptions(manifestPath: string | undefined): Promise<ImportOptions> {
  if (manifestPath === undefined) return { knownSpecies: new Set(loadRegistry().species.keys()) }
  const manifest = await loadManifest(manifestPath)
  return { knownSpecies: new Set(manifest.species.map((s) => s.name)) }
}

/** Um .dat extended lido como padrão falha cedo com flag absurda; a dica evita a investigação a olho. */
function withExtendedHint<T>(extended: boolean, parse: () => T): T {
  try {
    return parse()
  } catch (error) {
    if (extended) throw error
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message}\ndica: se o pack tem mais de 65535 sprites, tente --extended`)
  }
}

const program = new Command().name('pokeidle-assets').description('Pipeline de assets do Pokeidle')

program
  .command('inspect')
  .argument('<spr>')
  .argument('<dat>')
  .option('--version <v>', 'versão do .dat (860 ou 854)', '860')
  .option('--extended', 'formato extended: contagem e ids de sprite em u32 (packs com mais de 65535 sprites)', false)
  .action(async (sprPath: string, datPath: string, opts: { version: string; extended: boolean }) => {
    const format = { extended: opts.extended }
    const spr = parseSpr(new Uint8Array(await readFile(sprPath)), format)
    const datBytes = new Uint8Array(await readFile(datPath))
    const dat = withExtendedHint(opts.extended, () => parseDat(datBytes, parseVersion(opts.version), format))
    out(`spr signature 0x${spr.signature.toString(16)}, ${spr.spriteCount} sprites${opts.extended ? ' (extended)' : ''}`)
    out(`dat signature 0x${dat.signature.toString(16)}`)
    out(`itens: ${dat.items.length} (100..${dat.items.length + 99})`)
    out(`outfits: ${dat.outfits.length}, efeitos: ${dat.effects.length}, mísseis: ${dat.missiles.length}`)
    const big = dat.outfits.filter((o) => o.width > 1 || o.height > 1).length
    out(`outfits multi-tile: ${big}`)
    for (const warning of dat.warnings) out(`aviso: ${warning}`)
  })

program
  .command('extract')
  .argument('<spr>')
  .argument('<dat>')
  .option('--out <dir>', 'pasta de saída', 'assets/extracted')
  .option('--version <v>', 'versão do .dat (860 ou 854)', '860')
  .option('--extended', 'formato extended: contagem e ids de sprite em u32 (packs com mais de 65535 sprites)', false)
  .action(async (sprPath: string, datPath: string, opts: { out: string; version: string; extended: boolean }) => {
    await extractAll({ sprPath, datPath, outDir: opts.out, version: parseVersion(opts.version), extended: opts.extended }, out)
  })

program
  .command('build')
  .option('--extracted <dir>', 'pasta com PNGs extraídos e catalog.json', 'assets/extracted')
  .option('--manifest <file>', 'manifest de curadoria', 'tools/assets/manifest.json')
  .option('--out <dir>', 'pasta de saída dos atlases', 'assets/atlas')
  .action(async (opts: { extracted: string; manifest: string; out: string }) => {
    await buildAtlases({ extractedDir: opts.extracted, manifestPath: opts.manifest, outDir: opts.out }, out)
  })

program
  .command('contact-sheet')
  .option('--extracted <dir>', 'pasta com PNGs extraídos e catalog.json', 'assets/extracted')
  .option('--all-outfits', 'incluir outfits 1x1', false)
  .option('--all-items', 'incluir itens que não são chão', false)
  .option('--tileset <dir>', 'desenha o atlas gerado em vez do dump extraído')
  .action(async (opts: { extracted: string; allOutfits: boolean; allItems: boolean; tileset?: string }) => {
    if (opts.tileset !== undefined) {
      const sheet = JSON.parse(await readFile(join(opts.tileset, 'tiles.json'), 'utf8')) as PixiSpritesheet
      const target = join(opts.tileset, 'tileset.html')
      await writeFile(target, renderTilesetSheet(sheet))
      out(`folha do tileset em ${target} (${Object.keys(sheet.frames).length} tiles)`)
      return
    }
    const path = await writeContactSheet(opts.extracted, { onlyMultiTileOutfits: !opts.allOutfits, groundItemsOnly: !opts.allItems })
    out(`abra no navegador: ${path}`)
  })

program
  .command('map-import')
  .argument('<tiled>', 'mapa exportado do Tiled em JSON (.tmj)')
  .requiredOption('--id <id>', 'id kebab-case da hunt')
  .requiredOption('--name <nome>', 'nome exibido da hunt')
  .option('--tileset <file>', 'tileset gerado pelo build', 'assets/atlas/tiles.tsj')
  .option('--manifest <file>', 'opcional: usa os nomes do manifest em vez do registro do shared')
  .option('--out <dir>', 'pasta de saída', 'packages/shared/data/hunts')
  .action(async (tiledPath: string, opts: { id: string; name: string; tileset: string; manifest?: string; out: string }) => {
    const tiled = await readJson(tiledPath)
    const tileset = parseTiledTileset(await readJson(opts.tileset))
    const map = importTiledMap(tiled, tileset, { id: opts.id, name: opts.name }, await importOptions(opts.manifest))
    await mkdir(opts.out, { recursive: true })
    const target = join(opts.out, `${map.id}.json`)
    await writeFile(target, JSON.stringify(map, null, 2))
    out(`hunt gravada em ${target} (${map.width}x${map.height}, ${map.spawns.length} spawns)`)
  })

program
  .command('map-preview')
  .argument('<mapa>', 'hunt em JSON (packages/shared/data/hunts/route-1.json)')
  .option('--atlas <dir>', 'pasta do atlas gerado pelo build', 'assets/atlas')
  .option('--out <file>', 'arquivo PNG de saída', 'preview.png')
  .option('--blocking', 'pinta de vermelho os tiles bloqueados', false)
  .action(async (mapPath: string, opts: { atlas: string; out: string; blocking: boolean }) => {
    const map = parseHuntMap(await readJson(mapPath))
    const atlas = await loadTilesAtlas(opts.atlas)
    const image = renderMapPreview(map, atlas, { blocking: opts.blocking })
    await writeFile(opts.out, encodePng(image))
    out(`prévia em ${opts.out} (${image.width}x${image.height})`)
  })

export { program, readJson }
