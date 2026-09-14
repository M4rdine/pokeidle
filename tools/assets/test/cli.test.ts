import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseVersion, program, readJson } from '../src/cli.js'
import { buildDat, groundItemSpec, outfitSpec } from './fixtures/dat-fixture.js'
import { buildSpr, solidSprite } from './fixtures/spr-fixture.js'

const tileset = {
  type: 'tileset',
  version: '1.10',
  name: 'tibia-tiles',
  image: 'tiles.png',
  imagewidth: 32,
  imageheight: 32,
  tilewidth: 32,
  tileheight: 32,
  tilecount: 1,
  columns: 1,
  margin: 0,
  spacing: 0,
  tiles: [{ id: 0, properties: [{ name: 'name', type: 'string', value: 'grass' }] }],
}

const tiledMap = {
  type: 'map',
  orientation: 'orthogonal',
  width: 2,
  height: 1,
  tilewidth: 32,
  tileheight: 32,
  tilesets: [{ firstgid: 1, source: 'tiles.tsj' }],
  layers: [
    { type: 'tilelayer', name: 'ground', data: [1, 1] },
    { type: 'tilelayer', name: 'detail', data: [0, 0] },
    { type: 'tilelayer', name: 'blocking', data: [0, 0] },
    {
      type: 'objectgroup',
      name: 'objects',
      objects: [
        { id: 1, class: 'spawnPoint', x: 0, y: 0, width: 32, height: 32 },
        { id: 2, class: 'pokecenter', x: 32, y: 0, width: 32, height: 32 },
      ],
    },
  ],
}

function captureStdout(): { lines: () => string } {
  const chunks: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  })
  return { lines: () => chunks.join('') }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseVersion', () => {
  it('aceita as duas versões suportadas', () => {
    expect(parseVersion('860')).toBe(860)
    expect(parseVersion('854')).toBe(854)
  })

  it('recusa qualquer outra versão', () => {
    expect(() => parseVersion('1098')).toThrow(/versão de \.dat não suportada: 1098/)
  })
})

describe('readJson', () => {
  it('nomeia o arquivo em JSON malformado', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-json-'))
    const path = join(dir, 'quebrado.json')
    await writeFile(path, '{ not json')
    await expect(readJson(path)).rejects.toThrow(/quebrado\.json: /)
  })

  it('devolve o conteúdo de um JSON válido', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-json-'))
    const path = join(dir, 'ok.json')
    await writeFile(path, JSON.stringify({ a: 1 }))
    await expect(readJson(path)).resolves.toEqual({ a: 1 })
  })
})

describe('program', () => {
  it('inspect resume o spr e o dat', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-cli-'))
    const sprPath = join(dir, 'Tibia.spr')
    const datPath = join(dir, 'Tibia.dat')
    await writeFile(sprPath, buildSpr([solidSprite([255, 0, 0])]))
    await writeFile(datPath, buildDat({ items: [groundItemSpec(1)], outfits: [outfitSpec(1, 1)] }))

    const stdout = captureStdout()
    await program.parseAsync(['node', 'cli', 'inspect', sprPath, datPath])

    expect(stdout.lines()).toMatch(/itens: 1 \(100\.\.100\)/)
    expect(stdout.lines()).toMatch(/outfits multi-tile: 1/)
  })

  it('map-import grava a hunt na pasta de saída', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-cli-'))
    const tiledPath = join(dir, 'route.tmj')
    const tilesetPath = join(dir, 'tiles.tsj')
    const outDir = join(dir, 'hunts')
    await writeFile(tiledPath, JSON.stringify(tiledMap))
    await writeFile(tilesetPath, JSON.stringify(tileset))

    const stdout = captureStdout()
    await program.parseAsync([
      'node',
      'cli',
      'map-import',
      tiledPath,
      '--id',
      'rota-1',
      '--name',
      'Rota 1',
      '--tileset',
      tilesetPath,
      '--out',
      outDir,
    ])

    const written = JSON.parse(await readFile(join(outDir, 'rota-1.json'), 'utf8'))
    expect(written).toMatchObject({ id: 'rota-1', name: 'Rota 1', width: 2, height: 1, spawns: [] })
    expect(stdout.lines()).toMatch(/hunt gravada em/)
  })
})
