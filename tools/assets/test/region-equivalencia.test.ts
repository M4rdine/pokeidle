import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseTiledTileset } from '../src/tiled-import.js'
import { importRegion } from '../src/region-import.js'

/**
 * A prova de que trocar "um mapa é uma caçada" por "região com áreas" não mudou comportamento:
 * a Rota 1 importada pelo caminho novo tem que ser idêntica, tile a tile, à que está em uso.
 */
describe('Kanto contém a Rota 1 de hoje, sem diferença', () => {
  it('a área route-1 recortada de kanto.tmj bate com packages/shared/data/hunts/route-1.json', async () => {
    const tileset = parseTiledTileset(JSON.parse(await readFile('../../assets/atlas/tiles.tsj', 'utf8')))
    const regiao = JSON.parse(await readFile('maps/kanto.tmj', 'utf8'))
    const atual = JSON.parse(await readFile('../../packages/shared/data/hunts/route-1.json', 'utf8'))

    const { region, hunts } = importRegion(regiao, tileset)

    expect(region).toMatchObject({ id: 'kanto', name: 'Kanto', minTrainerLevel: 1, width: 40, height: 30 })
    expect(hunts).toHaveLength(1)
    expect(hunts[0]).toEqual(atual)
  })
})
