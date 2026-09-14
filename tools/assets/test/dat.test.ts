import { describe, expect, it } from 'vitest'
import { FIRST_ITEM_ID, FLAG_CLOTH, FLAG_DISPLACEMENT, FLAG_GROUND, FLAG_LIGHT, FLAG_NOT_WALKABLE, parseDat } from '../src/dat.js'
import { buildDat, groundItemSpec, outfitSpec } from './fixtures/dat-fixture.js'

describe('parseDat (860)', () => {
  const file = buildDat({
    signature: 0x0102_0304,
    items: [groundItemSpec(1, 150), { ...groundItemSpec(2), flags: [FLAG_NOT_WALKABLE] }],
    outfits: [outfitSpec(2, 10, [FLAG_DISPLACEMENT, 8, 0, 8, 0])],
  })
  const dat = parseDat(file, 860)

  it('lê o cabeçalho e as contagens', () => {
    expect(dat.signature).toBe(0x0102_0304)
    expect(dat.version).toBe(860)
    expect(dat.items).toHaveLength(2)
    expect(dat.outfits).toHaveLength(1)
    expect(dat.effects).toHaveLength(0)
    expect(dat.missiles).toHaveLength(0)
  })

  it('numera itens a partir de 100 e outfits a partir de 1', () => {
    expect(dat.items[0]?.id).toBe(FIRST_ITEM_ID)
    expect(dat.items[1]?.id).toBe(FIRST_ITEM_ID + 1)
    expect(dat.outfits[0]?.id).toBe(1)
    expect(dat.outfits[0]?.category).toBe('outfit')
  })

  it('lê flags com dados e flags sem dados', () => {
    const ground = dat.items[0]!
    expect(ground.flags.has(FLAG_GROUND)).toBe(true)
    expect(ground.groundSpeed).toBe(150)
    const wall = dat.items[1]!
    expect(wall.flags.has(FLAG_NOT_WALKABLE)).toBe(true)
    expect(wall.groundSpeed).toBeNull()
  })

  it('lê dimensões, padrões, fases e sprite ids do outfit', () => {
    const o = dat.outfits[0]!
    expect(o).toMatchObject({ width: 2, height: 2, layers: 1, patternX: 4, patternY: 1, patternZ: 1, phases: 2 })
    expect(o.spriteIds).toHaveLength(32)
    expect(o.spriteIds[0]).toBe(10)
    expect(o.spriteIds[31]).toBe(41)
    expect(o.displacement).toEqual({ x: 8, y: 8 })
  })

  it('lança erro claro para flag desconhecida', () => {
    const broken = buildDat({ items: [{ ...groundItemSpec(1), flags: [0x7e] }], outfits: [] })
    expect(() => parseDat(broken, 860)).toThrow(/flag desconhecida 0x7e.*item 100/)
  })

  it('lança erro para 0xfe em 860 (não é a flag Chargeable de 854)', () => {
    const broken = buildDat({ items: [{ ...groundItemSpec(1), flags: [0xfe] }], outfits: [] })
    expect(() => parseDat(broken, 860)).toThrow(/flag desconhecida 0xfe.*item 100/)
  })

  it('lê Light (0x15, dois u16) e Cloth (0x20, um u16)', () => {
    const file = buildDat({
      items: [
        { ...groundItemSpec(1), flags: [FLAG_LIGHT, 5, 0, 6, 0] },
        { ...groundItemSpec(2), flags: [FLAG_CLOTH, 3, 0] },
      ],
      outfits: [],
    })
    const parsed = parseDat(file, 860)
    expect(parsed.items[0]!.flags.has(FLAG_LIGHT)).toBe(true)
    expect(parsed.items[0]!.spriteIds).toEqual([1])
    expect(parsed.items[1]!.flags.has(FLAG_CLOTH)).toBe(true)
    expect(parsed.items[1]!.spriteIds).toEqual([2])
  })

  it('rejeita 0x21 (Market), que só existe a partir de 9.44', () => {
    const broken = buildDat({ items: [{ ...groundItemSpec(1), flags: [0x21, 0, 0] }], outfits: [] })
    expect(() => parseDat(broken, 860)).toThrow(/flag desconhecida 0x21.*item 100/)
  })

  it('identifica a thing em erro de leitura truncada', () => {
    const file = buildDat({ items: [groundItemSpec(1)], outfits: [outfitSpec(1, 10)] })
    const truncated = file.slice(0, file.length - 4)
    expect(() => parseDat(truncated, 860)).toThrow(/outfit 1:.*ultrapassa o buffer/)
  })
})

describe('parseDat (categorias opcionais)', () => {
  it('ignora efeitos corrompidos e registra um aviso, preservando itens e outfits', () => {
    const file = buildDat({
      items: [groundItemSpec(1)],
      outfits: [outfitSpec(1, 10)],
      effects: [{ ...groundItemSpec(2), flags: [0x7e] }],
    })
    const parsed = parseDat(file, 860)
    expect(parsed.items).toHaveLength(1)
    expect(parsed.outfits).toHaveLength(1)
    expect(parsed.effects).toEqual([])
    expect(parsed.warnings).toHaveLength(1)
    expect(parsed.warnings[0]).toMatch(/efeitos ignorados:.*flag desconhecida 0x7e/)
  })

  it('não registra avisos em um arquivo íntegro', () => {
    const file = buildDat({ items: [groundItemSpec(1)], outfits: [outfitSpec(1, 10)] })
    expect(parseDat(file, 860).warnings).toEqual([])
  })
})

describe('parseDat (854)', () => {
  it('trata a flag 8 como Chargeable sem dados e desloca as demais', () => {
    // em 854: 0x19 = Displacement (0x18 em 860), 0x08 = Chargeable
    const file = buildDat({
      items: [{ ...groundItemSpec(1), flags: [0x00, 100, 0, 0x08] }],
      outfits: [outfitSpec(1, 10, [0x19, 4, 0, 4, 0])],
    })
    const dat = parseDat(file, 854)
    expect(dat.items[0]?.groundSpeed).toBe(100)
    expect(dat.outfits[0]?.displacement).toEqual({ x: 4, y: 4 })
    expect(dat.outfits[0]?.flags.has(FLAG_DISPLACEMENT)).toBe(true)
  })
})
