import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { Catalog } from '../src/catalog.js'
import { expandedTileNames, loadManifest, parseManifest, validateManifest } from '../src/manifest.js'

const catalog: Catalog = {
  version: 860,
  extended: false,
  sprSignature: 1,
  datSignature: 2,
  outfits: [
    { id: 10, width: 2, height: 2, directions: 4, phases: 3, layers: 1, displacement: { x: 8, y: 8 } },
    { id: 11, width: 1, height: 1, directions: 1, phases: 1, layers: 1, displacement: { x: 0, y: 0 } },
  ],
  items: [
    { id: 100, width: 1, height: 1, patternX: 2, patternY: 1, phases: 1, isGround: true, isBlocking: false },
    { id: 101, width: 2, height: 2, patternX: 1, patternY: 1, phases: 1, isGround: true, isBlocking: false },
  ],
}

const valid = {
  version: 1,
  species: [{ id: 1, name: 'bulbasaur', outfitId: 10 }],
  tiles: [{ name: 'grass', itemId: 100, patternX: 1, patternY: 0 }],
}

describe('parseManifest', () => {
  it('aceita um manifest válido e aplica defaults de pattern', () => {
    const m = parseManifest({ ...valid, tiles: [{ name: 'grass', itemId: 100 }] })
    expect(m.tiles[0]).toEqual({ name: 'grass', itemId: 100, patternX: 0, patternY: 0 })
  })

  it('rejeita nome fora de kebab-case com mensagem legível', () => {
    expect(() => parseManifest({ ...valid, species: [{ id: 1, name: 'Bulbasaur', outfitId: 10 }] })).toThrow(/species\.0\.name/)
  })

  it('rejeita nome só de dígitos, que viraria id local no tileset', () => {
    expect(() => parseManifest({ ...valid, species: [{ id: 1, name: '42', outfitId: 10 }] })).toThrow(/species\.0\.name.*só dígitos/s)
    expect(() => parseManifest({ ...valid, tiles: [{ name: '42', itemId: 100 }] })).toThrow(/tiles\.0\.name.*só dígitos/s)
  })

  it('tolera chaves extras no topo, como o _leiame do manifest.example.json', () => {
    const m = parseManifest({ ...valid, _leiame: 'anotação para quem edita à mão' })
    expect(m.species).toHaveLength(1)
  })
})

describe('validateManifest', () => {
  it('devolve lista vazia para manifest coerente com o catálogo', () => {
    expect(validateManifest(parseManifest(valid), catalog)).toEqual([])
  })

  it('aponta outfit inexistente, outfit sem 4 direções e item inexistente', () => {
    const m = parseManifest({
      version: 1,
      species: [
        { id: 1, name: 'a', outfitId: 999 },
        { id: 2, name: 'b', outfitId: 11 },
      ],
      tiles: [{ name: 't', itemId: 555 }],
    })
    const problems = validateManifest(m, catalog)
    expect(problems).toHaveLength(3)
    expect(problems[0]).toMatch(/a.*outfit 999/)
    expect(problems[1]).toMatch(/b.*4 direções/)
    expect(problems[2]).toMatch(/t.*item 555/)
  })

  it('aponta item grande sem slice, porque o tileset usa células de 32px', () => {
    const m = parseManifest({ version: 1, species: [], tiles: [{ name: 'big', itemId: 101 }] })
    expect(validateManifest(m, catalog)).toEqual(['tile big: item 101 é 2x2; use "slice" para cortá-lo em peças de um tile'])
  })

  it('aponta nomes e ids duplicados e pattern fora da faixa', () => {
    const m = parseManifest({
      version: 1,
      species: [
        { id: 1, name: 'dup', outfitId: 10 },
        { id: 1, name: 'dup', outfitId: 10 },
      ],
      tiles: [{ name: 'grass', itemId: 100, patternX: 2, patternY: 0 }],
    })
    const problems = validateManifest(m, catalog)
    expect(problems.some((p) => /nome de espécie duplicado.*dup/.test(p))).toBe(true)
    expect(problems.some((p) => /id de espécie duplicado.*1/.test(p))).toBe(true)
    expect(problems.some((p) => /grass.*patternX 2/.test(p))).toBe(true)
  })
})

describe('tiles fatiados', () => {
  it('aceita slice compatível com o catálogo e expande os nomes', () => {
    const manifest = parseManifest({ version: 1, species: [], tiles: [{ name: 'pokecenter', itemId: 101, slice: { cols: 2, rows: 2 } }] })
    const tile = manifest.tiles[0]!
    expect(tile.slice).toEqual({ cols: 2, rows: 2 })
    expect(expandedTileNames(tile)).toEqual(['pokecenter-x0-y0', 'pokecenter-x1-y0', 'pokecenter-x0-y1', 'pokecenter-x1-y1'])
    expect(validateManifest(manifest, catalog)).toEqual([])
  })
  it('tile simples continua com um nome só', () => {
    const manifest = parseManifest({ version: 1, species: [], tiles: [{ name: 'grass', itemId: 100 }] })
    expect(expandedTileNames(manifest.tiles[0]!)).toEqual(['grass'])
  })
  it('recusa slice que não bate com o item e item grande sem slice', () => {
    const wrongSlice = parseManifest({ version: 1, species: [], tiles: [{ name: 'pokecenter', itemId: 101, slice: { cols: 3, rows: 2 } }] })
    expect(validateManifest(wrongSlice, catalog).join('\n')).toMatch(/pokecenter.*3x2.*101.*2x2/)
    const missingSlice = parseManifest({ version: 1, species: [], tiles: [{ name: 'pokecenter', itemId: 101 }] })
    expect(validateManifest(missingSlice, catalog).join('\n')).toMatch(/pokecenter.*use "slice"/)
  })
  it('nome duplicado depois da expansão é recusado', () => {
    const clash = parseManifest({
      version: 1,
      species: [],
      tiles: [{ name: 'casa', itemId: 101, slice: { cols: 2, rows: 2 } }, { name: 'casa-x0-y0', itemId: 100 }],
    })
    expect(validateManifest(clash, catalog).join('\n')).toMatch(/nome de tile duplicado: casa-x0-y0/)
  })
})

describe('terrenos', () => {
  const terrainManifest = (over: Record<string, unknown> = {}) => ({
    version: 1,
    species: [],
    tiles: [{ name: 'grass', itemId: 100 }, { name: 'dirt', itemId: 100, patternX: 1 }],
    terrains: [{
      name: 'grama-terra',
      colors: ['grama', 'terra'],
      tiles: [
        { tile: 'grass', corners: ['grama', 'grama', 'grama', 'grama'] },
        { tile: 'dirt', corners: ['terra', 'terra', 'terra', 'terra'] },
      ],
    }],
    ...over,
  })
  it('aceita um terreno coerente', () => {
    const manifest = parseManifest(terrainManifest())
    expect(manifest.terrains?.[0]?.tiles).toHaveLength(2)
    expect(validateManifest(manifest, catalog)).toEqual([])
  })
  it('recusa terreno citando tile inexistente ou cor fora da lista', () => {
    const unknownTile = parseManifest(terrainManifest({
      terrains: [{ name: 'grama-terra', colors: ['grama'], tiles: [{ tile: 'nao-existe', corners: ['grama', 'grama', 'grama', 'grama'] }] }],
    }))
    expect(validateManifest(unknownTile, catalog).join('\n')).toMatch(/terreno grama-terra: tile "nao-existe" não existe/)
    const unknownColor = parseManifest(terrainManifest({
      terrains: [{ name: 'grama-terra', colors: ['grama'], tiles: [{ tile: 'grass', corners: ['grama', 'agua', 'grama', 'grama'] }] }],
    }))
    expect(validateManifest(unknownColor, catalog).join('\n')).toMatch(/terreno grama-terra: cor "agua" não está em colors/)
  })
  it('um tile fatiado também pode entrar num terreno', () => {
    const manifest = parseManifest({
      version: 1,
      species: [],
      tiles: [{ name: 'casa', itemId: 101, slice: { cols: 2, rows: 2 } }],
      terrains: [{ name: 'parede', colors: ['muro'], tiles: [{ tile: 'casa-x0-y0', corners: ['muro', 'muro', 'muro', 'muro'] }] }],
    })
    expect(validateManifest(manifest, catalog)).toEqual([])
  })
})

describe('transições', () => {
  it('aceita uma transição entre dois tiles existentes', () => {
    const manifest = parseManifest({
      version: 1,
      species: [],
      tiles: [{ name: 'grass', itemId: 100 }, { name: 'dirt', itemId: 100, patternX: 1 }],
      transitions: [{ name: 'grama-terra', from: 'grass', to: 'dirt' }],
    })
    expect(validateManifest(manifest, catalog)).toEqual([])
  })
  it('recusa transição citando tile inexistente', () => {
    const manifest = parseManifest({
      version: 1,
      species: [],
      tiles: [{ name: 'grass', itemId: 100 }],
      transitions: [{ name: 'grama-terra', from: 'grass', to: 'sumiu' }],
    })
    expect(validateManifest(manifest, catalog).join('\n')).toMatch(/transição grama-terra: tile "sumiu" não existe/)
  })
  it('recusa duas transições com o mesmo nome, que colidiriam no atlas', () => {
    const manifest = parseManifest({
      version: 1,
      species: [],
      tiles: [{ name: 'grass', itemId: 100 }, { name: 'dirt', itemId: 100, patternX: 1 }],
      transitions: [
        { name: 'grama-terra', from: 'grass', to: 'dirt' },
        { name: 'grama-terra', from: 'dirt', to: 'grass' },
      ],
    })
    expect(validateManifest(manifest, catalog).join('\n')).toMatch(/nome de transição duplicado: grama-terra/)
  })
  it('recusa transição com from e to iguais, que deixaria o terreno com a mesma cor duas vezes', () => {
    const manifest = parseManifest({
      version: 1,
      species: [],
      tiles: [{ name: 'grass', itemId: 100 }],
      transitions: [{ name: 'grama-grama', from: 'grass', to: 'grass' }],
    })
    expect(validateManifest(manifest, catalog).join('\n')).toMatch(/transição grama-grama: from e to são o mesmo tile/)
  })
  it('recusa tile cujo nome colide com uma peça mista gerada pela transição', () => {
    const manifest = parseManifest({
      version: 1,
      species: [],
      tiles: [
        { name: 'grass', itemId: 100 },
        { name: 'dirt', itemId: 100, patternX: 1 },
        { name: 'grama-terra-baaa', itemId: 100, patternX: 1 }, // colide com a peça mista "baaa" gerada pela transição
      ],
      transitions: [{ name: 'grama-terra', from: 'grass', to: 'dirt' }],
    })
    expect(validateManifest(manifest, catalog).join('\n')).toMatch(/nome de tile duplicado: grama-terra-baaa/)
  })
})

describe('loadManifest', () => {
  it('rejeita JSON malformado nomeando o arquivo', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'manifest-'))
    const filePath = join(tempDir, 'manifest.json')
    await writeFile(filePath, '{ not json')
    await expect(loadManifest(filePath)).rejects.toThrow(/manifest .*manifest\.json/)
  })

  it('carrega manifest válido de arquivo', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'manifest-'))
    const filePath = join(tempDir, 'manifest.json')
    const validManifest = { version: 1, species: [{ id: 42, name: 'test-species', outfitId: 10 }], tiles: [] }
    await writeFile(filePath, JSON.stringify(validManifest))
    const loaded = await loadManifest(filePath)
    expect(loaded.species).toHaveLength(1)
    expect(loaded.species[0]!.name).toBe('test-species')
  })
})
