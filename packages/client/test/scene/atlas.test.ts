import { describe, expect, it } from 'vitest'
import { frameOf, loadAtlas, type SpritesheetJson } from '../../src/scene/atlas.js'

const sheet: SpritesheetJson = {
  frames: { 'charmander/walk_south_0': { frame: { x: 64, y: 0, w: 32, h: 32 } }, 'charmander/walk_south_1': { frame: { x: 96, y: 0, w: 32, h: 32 } } },
  animations: { 'charmander/walk_south': ['charmander/walk_south_0', 'charmander/walk_south_1'] },
  meta: { image: 'pokemon.png', size: { w: 128, h: 32 }, scale: '1' },
}

describe('atlas', () => {
  it('frameOf devolve o retângulo do frame pedido ou null', () => {
    expect(frameOf({ pokemon: sheet, tiles: sheet }, 'charmander', 'south', 1)).toEqual({ x: 96, y: 0, w: 32, h: 32 })
    expect(frameOf({ pokemon: sheet, tiles: sheet }, 'mewtwo', 'south', 0)).toBeNull()
  })

  it('loadAtlas busca os dois JSONs e falha com mensagem clara quando o atlas não existe', async () => {
    const ok = async (url: string) => new Response(JSON.stringify(sheet), { status: 200, headers: { 'content-type': 'application/json' } })
    const atlas = await loadAtlas(ok as typeof fetch)
    expect(atlas.pokemon.animations['charmander/walk_south']).toHaveLength(2)
    const missing = async () => new Response('{}', { status: 404 })
    await expect(loadAtlas(missing as typeof fetch)).rejects.toThrow(/atlas/)
  })
})
