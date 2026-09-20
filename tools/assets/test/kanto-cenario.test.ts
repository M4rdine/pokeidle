import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

interface Tsj { readonly tiles: readonly { readonly id: number; readonly properties: readonly { readonly value: string }[] }[] }
interface Manifest {
  readonly terrainSets: readonly { readonly name: string }[]
  readonly props: readonly { readonly name: string }[]
}
interface Tmj { readonly layers: readonly { readonly type: string; readonly data?: readonly number[] }[] }

/**
 * A promessa do sprint: Kanto é cenário desenhado por nós. Os tiles recortados do dump do
 * OTPokemon continuam no atlas (o extrator ainda os produz), mas nenhum deles pode aparecer no
 * mapa — é isso que separa "arte própria" de "fan pack redistribuído".
 */
describe('Kanto só usa cenário desenhado', () => {
  it('todo tile das camadas vem de um conjunto de terreno ou de um prop do manifesto', async () => {
    const tsj = JSON.parse(await readFile('test/fixtures/tiles.tsj', 'utf8')) as Tsj
    const manifest = JSON.parse(await readFile('manifest.json', 'utf8')) as Manifest
    const mapa = JSON.parse(await readFile('maps/kanto.tmj', 'utf8')) as Tmj

    const nomePorGid = new Map(tsj.tiles.map((t) => [t.id + 1, t.properties[0]!.value]))
    const desenhado = (nome: string): boolean =>
      manifest.terrainSets.some((s) => nome.startsWith(`${s.name}-`)) ||
      manifest.props.some((p) => nome === p.name || nome.startsWith(`${p.name}-`))

    const usados = new Set<string>()
    for (const layer of mapa.layers) {
      if (layer.type !== 'tilelayer' || !layer.data) continue
      for (const gid of layer.data) {
        if (gid === 0) continue
        const nome = nomePorGid.get(gid)
        expect(nome, `gid ${gid} sem nome no tileset`).toBeDefined()
        usados.add(nome!)
      }
    }

    expect(usados.size).toBeGreaterThan(20) // se o mapa vier vazio o teste não prova nada
    expect([...usados].filter((n) => !desenhado(n))).toEqual([])
  })
})
