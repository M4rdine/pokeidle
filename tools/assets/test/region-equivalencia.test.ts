import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { parseTiledTileset } from '../src/tiled-import.js'
import { importRegion } from '../src/region-import.js'

/**
 * O contrato entre o mapa desenhado e o conteúdo publicado: recortar kanto.tmj tem que
 * reproduzir, tile a tile, exatamente os arquivos que o servidor carrega. Se alguém editar o
 * .tmj e esquecer de reimportar (ou o contrário), este teste acusa antes do jogo abrir.
 *
 * O contrato cobre o que o IMPORTADOR é dono. `townMap` e o `noMapa` de cada área não saem do
 * Tiled: são escritos à mão e dizem onde a área cai no Town Map oficial. Compará-los aqui faria
 * o teste exigir que o importador inventasse um dado que ele não tem como saber — e é por isso
 * que o próprio `region-import` os PRESERVA em vez de sobrescrever.
 *
 * Mas eles não ficam sem guarda: o segundo caso confere que toda área publicada tem o seu, e que
 * a região aponta para um mapa. Sem isso, a tela de escolher destino perde marcador sem aviso.
 */
const semAutoria = (r: unknown): unknown => {
  const { townMap: _mapa, areas, ...resto } = r as { townMap?: string; areas: Record<string, unknown>[] }
  return { ...resto, areas: areas.map(({ noMapa: _ponto, ...area }) => area) }
}

describe('Kanto recortada bate com o conteúdo publicado', () => {
  it('a região e todas as áreas de kanto.tmj são idênticas ao que está em packages/shared/data', async () => {
    // Fixture com os metadados do tileset (nomes e wangsets, nenhum pixel): o atlas de verdade
    // é ignorado pelo git, e sem isso este teste só passaria na máquina de quem gerou o atlas.
    const tileset = parseTiledTileset(JSON.parse(await readFile('test/fixtures/tiles.tsj', 'utf8')))
    const regiao = JSON.parse(await readFile('maps/kanto.tmj', 'utf8'))
    const publicadas = JSON.parse(await readFile('../../packages/shared/data/regions.json', 'utf8')) as { id: string }[]

    const { region, hunts } = importRegion(regiao, tileset)

    expect(semAutoria(region)).toEqual(semAutoria(publicadas.find((r) => r.id === 'kanto')))
    for (const hunt of hunts) {
      const atual = JSON.parse(await readFile(`../../packages/shared/data/hunts/${hunt.id}.json`, 'utf8'))
      expect(hunt, `área ${hunt.id}`).toEqual(atual)
    }
    expect(hunts.map((h) => h.id)).toEqual(region.areas.map((a) => a.id))
  })

  it('toda região publicada aponta para um Town Map, e toda área tem posição nele', async () => {
    const publicadas = JSON.parse(await readFile('../../packages/shared/data/regions.json', 'utf8')) as {
      id: string; townMap?: string; areas: { id: string; noMapa?: { x: number; y: number; local: string } }[]
    }[]
    const faltando = publicadas.flatMap((r) => [
      ...(r.townMap === undefined ? [`região ${r.id} sem townMap`] : []),
      ...r.areas.filter((a) => a.noMapa === undefined).map((a) => `área ${a.id} sem noMapa`),
    ])
    expect(faltando).toEqual([])
  })
})
