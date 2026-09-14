export interface ThingSpec {
  flags: number[]
  width: number
  height: number
  layers: number
  patternX: number
  patternY: number
  patternZ: number
  phases: number
  spriteIds: number[]
}

export interface DatSpec {
  signature?: number
  items: ThingSpec[]
  outfits: ThingSpec[]
  effects?: ThingSpec[]
  missiles?: ThingSpec[]
}

function u16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff]
}

function u32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]
}

function encodeThing(t: ThingSpec): number[] {
  const expected = t.width * t.height * t.layers * t.patternX * t.patternY * t.patternZ * t.phases
  if (t.spriteIds.length !== expected) {
    throw new Error(`spriteIds tem ${t.spriteIds.length}, esperado ${expected}`)
  }
  const size = t.width > 1 || t.height > 1 ? [32 * Math.max(t.width, t.height)] : []
  return [
    ...t.flags,
    0xff,
    t.width,
    t.height,
    ...size,
    t.layers,
    t.patternX,
    t.patternY,
    t.patternZ,
    t.phases,
    ...t.spriteIds.flatMap(u16),
  ]
}

export function buildDat(spec: DatSpec): Uint8Array {
  const effects = spec.effects ?? []
  const missiles = spec.missiles ?? []
  const lastItemId = 100 + spec.items.length - 1
  const header = [
    ...u32(spec.signature ?? 0x4a10_0001),
    ...u16(spec.items.length === 0 ? 99 : lastItemId),
    ...u16(spec.outfits.length),
    ...u16(effects.length),
    ...u16(missiles.length),
  ]
  const body = [...spec.items, ...spec.outfits, ...effects, ...missiles].flatMap(encodeThing)
  return new Uint8Array([...header, ...body])
}

/** Outfit 2x2, 4 direções, sem addon, 1 camada, N fases. */
export function outfitSpec(phases: number, firstSpriteId: number, extraFlags: number[] = []): ThingSpec {
  const count = 2 * 2 * 1 * 4 * 1 * 1 * phases
  return {
    flags: extraFlags,
    width: 2,
    height: 2,
    layers: 1,
    patternX: 4,
    patternY: 1,
    patternZ: 1,
    phases,
    spriteIds: Array.from({ length: count }, (_, i) => firstSpriteId + i),
  }
}

/** Item 1x1 de chão com velocidade. */
export function groundItemSpec(spriteId: number, speed = 100): ThingSpec {
  return {
    flags: [0x00, ...u16(speed)],
    width: 1,
    height: 1,
    layers: 1,
    patternX: 1,
    patternY: 1,
    patternZ: 1,
    phases: 1,
    spriteIds: [spriteId],
  }
}
