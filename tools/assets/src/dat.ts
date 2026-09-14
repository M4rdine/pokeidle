import { BinaryReader } from './binary-reader.js'

export type DatVersion = 854 | 860
export type ThingCategory = 'item' | 'outfit' | 'effect' | 'missile'

export const FIRST_ITEM_ID = 100
export const FLAG_GROUND = 0x00
export const FLAG_WRITABLE = 0x08
export const FLAG_WRITABLE_ONCE = 0x09
export const FLAG_NOT_WALKABLE = 0x0c
export const FLAG_LIGHT = 0x15
export const FLAG_DISPLACEMENT = 0x18
export const FLAG_ELEVATION = 0x19
export const FLAG_MINIMAP_COLOR = 0x1c
export const FLAG_LENS_HELP = 0x1d
export const FLAG_CLOTH = 0x20
export const FLAG_MARKET = 0x21
export const FLAG_END = 0xff
const FLAG_MAX_KNOWN = 0x25
/** Sentinela interna para a flag Chargeable do formato 8.54, que não existe em 8.60. Valor negativo nunca iguala um byte bruto lido do arquivo. */
const FLAG_CHARGEABLE_854 = -1

export interface ThingType {
  readonly id: number
  readonly category: ThingCategory
  readonly width: number
  readonly height: number
  readonly layers: number
  readonly patternX: number
  readonly patternY: number
  readonly patternZ: number
  readonly phases: number
  readonly spriteIds: readonly number[]
  readonly displacement: { readonly x: number; readonly y: number }
  readonly groundSpeed: number | null
  readonly flags: ReadonlySet<number>
}

export interface DatFile {
  readonly signature: number
  readonly version: DatVersion
  readonly items: readonly ThingType[]
  readonly outfits: readonly ThingType[]
  readonly effects: readonly ThingType[]
  readonly missiles: readonly ThingType[]
}

interface FlagBlock {
  readonly flags: ReadonlySet<number>
  readonly displacement: { readonly x: number; readonly y: number }
  readonly groundSpeed: number | null
}

function normalizeFlag(raw: number, version: DatVersion): number {
  if (version === 860) return raw
  if (raw === 0x08) return FLAG_CHARGEABLE_854
  return raw > 0x08 ? raw - 1 : raw
}

function skipMarketData(reader: BinaryReader): void {
  reader.u16() // category
  reader.u16() // tradeAs
  reader.u16() // showAs
  const nameLength = reader.u16()
  reader.bytes(nameLength)
  reader.u16() // restrictVocation
  reader.u16() // requiredLevel
}

function readFlags(reader: BinaryReader, version: DatVersion, label: string): FlagBlock {
  const flags = new Set<number>()
  let displacement = { x: 0, y: 0 }
  let groundSpeed: number | null = null
  for (;;) {
    const raw = reader.u8()
    if (raw === FLAG_END) break
    const flag = normalizeFlag(raw, version)
    flags.add(flag)
    switch (flag) {
      case FLAG_GROUND:
        groundSpeed = reader.u16()
        break
      case FLAG_WRITABLE:
      case FLAG_WRITABLE_ONCE:
      case FLAG_ELEVATION:
      case FLAG_MINIMAP_COLOR:
      case FLAG_LENS_HELP:
      case FLAG_CLOTH:
        reader.u16()
        break
      case FLAG_LIGHT:
        reader.u16()
        reader.u16()
        break
      case FLAG_DISPLACEMENT:
        displacement = { x: reader.u16(), y: reader.u16() }
        break
      case FLAG_MARKET:
        skipMarketData(reader)
        break
      case FLAG_CHARGEABLE_854:
        break
      default:
        if (flag > FLAG_MAX_KNOWN) {
          const hex = raw.toString(16).padStart(2, '0')
          throw new Error(`flag desconhecida 0x${hex} no ${label} (posição ${reader.position - 1})`)
        }
    }
  }
  return { flags, displacement, groundSpeed }
}

function readThing(reader: BinaryReader, id: number, category: ThingCategory, version: DatVersion): ThingType {
  const block = readFlags(reader, version, `${category} ${id}`)
  const width = reader.u8()
  const height = reader.u8()
  if (width > 1 || height > 1) reader.u8() // exactSize, não usado
  const layers = reader.u8()
  const patternX = reader.u8()
  const patternY = reader.u8()
  const patternZ = reader.u8()
  const phases = reader.u8()
  const count = width * height * layers * patternX * patternY * patternZ * phases
  const spriteIds = Array.from({ length: count }, () => reader.u16())
  return { id, category, width, height, layers, patternX, patternY, patternZ, phases, spriteIds, ...block }
}

function readCategory(
  reader: BinaryReader,
  category: ThingCategory,
  firstId: number,
  lastId: number,
  version: DatVersion,
): ThingType[] {
  const things: ThingType[] = []
  for (let id = firstId; id <= lastId; id++) {
    things.push(readThing(reader, id, category, version))
  }
  return things
}

export function parseDat(data: Uint8Array, version: DatVersion = 860): DatFile {
  const reader = BinaryReader.fromBuffer(data)
  const signature = reader.u32()
  const lastItemId = reader.u16()
  const outfitCount = reader.u16()
  const effectCount = reader.u16()
  const missileCount = reader.u16()
  const items = readCategory(reader, 'item', FIRST_ITEM_ID, lastItemId, version)
  const outfits = readCategory(reader, 'outfit', 1, outfitCount, version)
  const effects = readCategory(reader, 'effect', 1, effectCount, version)
  const missiles = readCategory(reader, 'missile', 1, missileCount, version)
  return { signature, version, items, outfits, effects, missiles }
}
