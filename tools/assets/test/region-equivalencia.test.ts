import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseTiledTileset } from '../src/tiled-import.js'
import { importRegion } from '../src/region-import.js'

/**
 * O contrato entre o mapa desenhado e o conteúdo publicado: recortar kanto.tmj tem que
 * reproduzir, tile a tile, exatamente os arquivos que o servidor carrega. Se alguém editar o
 * .tmj e esquecer de reimportar (ou o contrário), este teste acusa antes do jogo abrir.
 */
describe('Kanto recortada bate com o conteúdo publicado', () => {
  it('a região e todas as áreas de kanto.tmj são idênticas ao que está em packages/shared/data', async () => {
    // Fixture com os metadados do tileset (nomes e wangsets, nenhum pixel): o atlas de verdade
    // é ignorado pelo git, e sem isso este teste só passaria na máquina de quem gerou o atlas.
    const tileset = parseTiledTileset(JSON.parse(await readFile('test/fixtures/tiles.tsj', 'utf8')))
    const regiao = JSON.parse(await readFile('maps/kanto.tmj', 'utf8'))
    const publicadas = JSON.parse(await readFile('../../packages/shared/data/regions.json', 'utf8')) as { id: string }[]

    const { region, hunts } = importRegion(regiao, tileset)

    expect(region).toEqual(publicadas.find((r) => r.id === 'kanto'))
    for (const hunt of hunts) {
      const atual = JSON.parse(await readFile(`../../packages/shared/data/hunts/${hunt.id}.json`, 'utf8'))
      expect(hunt, `área ${hunt.id}`).toEqual(atual)
    }
    expect(hunts.map((h) => h.id)).toEqual(region.areas.map((a) => a.id))
  })
})
