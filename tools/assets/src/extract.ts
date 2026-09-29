import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildCatalog, hasSprites, parseCatalog, type Catalog } from './catalog.js'
import { DIRECTION_NAMES, composeFrame } from './compose.js'
import { parseDat, type DatVersion, type ThingType } from './dat.js'
import { readJson } from './json-file.js'
import { encodePng } from './png.js'
import { parseSpr, type SprFile } from './spr.js'

export interface ExtractOptions {
  readonly sprPath: string
  readonly datPath: string
  readonly outDir: string
  readonly version: DatVersion
  /** Formato extended (ids e contagem de sprites em u32). Padrão: false. */
  readonly extended?: boolean
}

export type Logger = (line: string) => void

export function directionName(patternX: number, index: number): string {
  return patternX === DIRECTION_NAMES.length ? DIRECTION_NAMES[index]! : `x${index}`
}

export function outfitFramePath(outDir: string, id: number, direction: string, phase: number): string {
  return join(outDir, 'outfits', String(id), `${direction}_${phase}.png`)
}

export function itemFramePath(outDir: string, id: number, px: number, py: number, phase = 0): string {
  const suffix = phase === 0 ? '' : `_${phase}`
  return join(outDir, 'items', `${id}_${px}_${py}${suffix}.png`)
}

async function writeOutfit(spr: SprFile, outfit: ThingType, outDir: string): Promise<void> {
  await mkdir(join(outDir, 'outfits', String(outfit.id)), { recursive: true })
  for (let x = 0; x < outfit.patternX; x++) {
    for (let phase = 0; phase < outfit.phases; phase++) {
      const img = composeFrame(spr, outfit, { patternX: x, phase })
      await writeFile(outfitFramePath(outDir, outfit.id, directionName(outfit.patternX, x), phase), encodePng(img))
    }
  }
}

/** Um efeito por fase; um projétil por direção. Ver `CatalogAnimation`. */
export function efeitoFramePath(outDir: string, id: number, phase: number): string {
  return join(outDir, 'efeitos', `${id}_${phase}.png`)
}

export function projetilFramePath(outDir: string, id: number, px: number, py: number): string {
  return join(outDir, 'projeteis', `${id}_${px}_${py}.png`)
}

async function writeEfeito(spr: SprFile, t: ThingType, outDir: string): Promise<void> {
  for (let phase = 0; phase < t.phases; phase++) {
    await writeFile(efeitoFramePath(outDir, t.id, phase), encodePng(composeFrame(spr, t, { patternX: 0, phase })))
  }
}

async function writeProjetil(spr: SprFile, t: ThingType, outDir: string): Promise<void> {
  for (let px = 0; px < t.patternX; px++) {
    for (let py = 0; py < t.patternY; py++) {
      await writeFile(projetilFramePath(outDir, t.id, px, py), encodePng(composeFrame(spr, t, { patternX: px, patternY: py, phase: 0 })))
    }
  }
}

async function writeItem(spr: SprFile, item: ThingType, outDir: string): Promise<void> {
  for (let px = 0; px < item.patternX; px++) {
    for (let py = 0; py < item.patternY; py++) {
      for (let phase = 0; phase < item.phases; phase++) {
        const img = composeFrame(spr, item, { patternX: px, patternY: py, phase })
        await writeFile(itemFramePath(outDir, item.id, px, py, phase), encodePng(img))
      }
    }
  }
}

/**
 * Escreve só os EFEITOS e PROJÉTEIS, mais o `catalog.json`.
 *
 * Mesmo motivo de `extractCatalog`: os PNGs de item são dezenas de milhares e não mudam quando o
 * que se quer é outra categoria do mesmo `.dat`. Reescrevê-los para ganhar os efeitos é meia hora
 * de disco por nada.
 */
export async function extractAnimations(opts: ExtractOptions, log: Logger = () => {}): Promise<Catalog> {
  const format = { extended: opts.extended ?? false }
  const spr = parseSpr(new Uint8Array(await readFile(opts.sprPath)), format)
  const dat = parseDat(new Uint8Array(await readFile(opts.datPath)), opts.version, format)
  await mkdir(join(opts.outDir, 'efeitos'), { recursive: true })
  await mkdir(join(opts.outDir, 'projeteis'), { recursive: true })
  const efeitos = dat.effects.filter(hasSprites)
  for (const t of efeitos) await writeEfeito(spr, t, opts.outDir)
  const projeteis = dat.missiles.filter(hasSprites)
  for (const t of projeteis) await writeProjetil(spr, t, opts.outDir)
  const catalog = buildCatalog(spr, dat)
  await writeFile(join(opts.outDir, 'catalog.json'), JSON.stringify(catalog, null, 2))
  log(`efeitos: ${efeitos.length} · projéteis: ${projeteis.length}`)
  return catalog
}

/**
 * Reescreve só o `catalog.json`, a partir do mesmo `.spr` e `.dat`.
 *
 * Existe porque o catálogo é uma LEITURA do dump, e os PNGs são o dump: quando se descobre uma
 * bandeira nova que vale registrar — poça, cadáver —, refazer trinta mil PNGs idênticos para
 * ganhar dois booleanos é minutos de espera por nada.
 */
export async function extractCatalog(opts: ExtractOptions, log: Logger = () => {}): Promise<Catalog> {
  const format = { extended: opts.extended ?? false }
  const spr = parseSpr(new Uint8Array(await readFile(opts.sprPath)), format)
  const dat = parseDat(new Uint8Array(await readFile(opts.datPath)), opts.version, format)
  const catalog = buildCatalog(spr, dat)
  await writeFile(join(opts.outDir, 'catalog.json'), JSON.stringify(catalog, null, 2))
  log(`catalog.json com ${catalog.outfits.length} outfits e ${catalog.items.length} itens`)
  return catalog
}

export async function extractAll(opts: ExtractOptions, log: Logger = () => {}): Promise<Catalog> {
  const format = { extended: opts.extended ?? false }
  const spr = parseSpr(new Uint8Array(await readFile(opts.sprPath)), format)
  const dat = parseDat(new Uint8Array(await readFile(opts.datPath)), opts.version, format)
  log(`spr: ${spr.spriteCount} sprites; dat: ${dat.items.length} itens, ${dat.outfits.length} outfits`)
  for (const warning of dat.warnings) log(`aviso: ${warning}`)

  await mkdir(join(opts.outDir, 'items'), { recursive: true })
  const outfits = dat.outfits.filter(hasSprites)
  for (const [i, outfit] of outfits.entries()) {
    await writeOutfit(spr, outfit, opts.outDir)
    if (i % 100 === 0) log(`outfits: ${i}/${outfits.length}`)
  }
  const items = dat.items.filter(hasSprites)
  for (const [i, item] of items.entries()) {
    await writeItem(spr, item, opts.outDir)
    if (i % 1000 === 0) log(`itens: ${i}/${items.length}`)
  }

  await mkdir(join(opts.outDir, 'efeitos'), { recursive: true })
  await mkdir(join(opts.outDir, 'projeteis'), { recursive: true })
  const efeitos = dat.effects.filter(hasSprites)
  for (const t of efeitos) await writeEfeito(spr, t, opts.outDir)
  const projeteis = dat.missiles.filter(hasSprites)
  for (const t of projeteis) await writeProjetil(spr, t, opts.outDir)
  log(`efeitos: ${efeitos.length} · projéteis: ${projeteis.length}`)

  const catalog = buildCatalog(spr, dat)
  await writeFile(join(opts.outDir, 'catalog.json'), JSON.stringify(catalog, null, 2))
  log(`catalog.json com ${catalog.outfits.length} outfits e ${catalog.items.length} itens`)
  return catalog
}

export async function loadCatalog(outDir: string): Promise<Catalog> {
  return parseCatalog(await readJson(join(outDir, 'catalog.json')))
}
