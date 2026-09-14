import { readFile } from 'node:fs/promises'
import { Command } from 'commander'
import { buildAtlases } from './build-atlases.js'
import { parseDat, type DatVersion } from './dat.js'
import { extractAll } from './extract.js'
import { parseSpr } from './spr.js'
import { writeContactSheet } from './contact-sheet.js'

const out = (line: string): void => void process.stdout.write(`${line}\n`)

export function parseVersion(raw: string): DatVersion {
  if (raw === '860') return 860
  if (raw === '854') return 854
  throw new Error(`versão de .dat não suportada: ${raw} (use 860 ou 854)`)
}

const program = new Command().name('pokeidle-assets').description('Pipeline de assets do Pokeidle')

program
  .command('inspect')
  .argument('<spr>')
  .argument('<dat>')
  .option('--version <v>', 'versão do .dat (860 ou 854)', '860')
  .action(async (sprPath: string, datPath: string, opts: { version: string }) => {
    const spr = parseSpr(new Uint8Array(await readFile(sprPath)))
    const dat = parseDat(new Uint8Array(await readFile(datPath)), parseVersion(opts.version))
    out(`spr signature 0x${spr.signature.toString(16)}, ${spr.spriteCount} sprites`)
    out(`dat signature 0x${dat.signature.toString(16)}`)
    out(`itens: ${dat.items.length} (100..${dat.items.length + 99})`)
    out(`outfits: ${dat.outfits.length}, efeitos: ${dat.effects.length}, mísseis: ${dat.missiles.length}`)
    const big = dat.outfits.filter((o) => o.width > 1 || o.height > 1).length
    out(`outfits multi-tile: ${big}`)
  })

program
  .command('extract')
  .argument('<spr>')
  .argument('<dat>')
  .option('--out <dir>', 'pasta de saída', 'assets/extracted')
  .option('--version <v>', 'versão do .dat (860 ou 854)', '860')
  .action(async (sprPath: string, datPath: string, opts: { out: string; version: string }) => {
    await extractAll({ sprPath, datPath, outDir: opts.out, version: parseVersion(opts.version) }, out)
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
  .action(async (opts: { extracted: string; allOutfits: boolean; allItems: boolean }) => {
    const path = await writeContactSheet(opts.extracted, { onlyMultiTileOutfits: !opts.allOutfits, groundItemsOnly: !opts.allItems })
    out(`abra no navegador: ${path}`)
  })

export { program }

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`erro: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
