import { mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import type { Catalog } from '../src/catalog.js'
import { loadManifest, parseManifest, validateManifest } from '../src/manifest.js'

const catalog: Catalog = {
  version: 860,
  sprSignature: 1,
  datSignature: 2,
  outfits: [
    { id: 10, width: 2, height: 2, directions: 4, phases: 3, layers: 1, displacement: { x: 8, y: 8 } },
    { id: 11, width: 1, height: 1, directions: 1, phases: 1, layers: 1, displacement: { x: 0, y: 0 } },
  ],
  items: [{ id: 100, width: 1, height: 1, patternX: 2, patternY: 1, phases: 1, isGround: true, isBlocking: false }],
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
