import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRegistry } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'

const registry = loadRegistry()
/** O mesmo caminho que `config.ts` usa como padrão, sem precisar de um ambiente configurado. */
const ATLAS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'atlas')

interface Sheet {
  readonly frames: Record<string, unknown>
  readonly animations?: Record<string, readonly string[]>
}

/**
 * O atlas que o servidor entrega é uma cópia do que o build gera, e por muito tempo essa cópia
 * era um `cp` manual documentado só no deploy. Quando ela ficou para trás, o jogo abriu com o
 * mapa em branco — o navegador pedia tiles que a cópia servida não tinha. Este teste falha antes
 * de alguém abrir o navegador.
 */
describe('o atlas servido cobre o que os mapas usam', () => {
  it('todo tile de todo mapa tem quadro no tiles.json publicado', async () => {
    const sheet = JSON.parse(await readFile(join(ATLAS_DIR, 'tiles.json'), 'utf8')) as Sheet
    const nomes = new Set(Object.keys(sheet.frames))

    const faltando = new Set<string>()
    for (const hunt of registry.hunts.values()) {
      const camadas = [hunt.layers.ground, hunt.layers.detail, hunt.layers.canopy ?? []]
      for (const camada of camadas) {
        for (const nome of camada) {
          if (nome !== null && !nomes.has(nome)) faltando.add(`${hunt.id}: ${nome}`)
        }
      }
    }
    expect([...faltando].sort().slice(0, 10)).toEqual([])
  })

  it('toda espécie caçável tem sprite no pokemon.json publicado', async () => {
    const sheet = JSON.parse(await readFile(join(ATLAS_DIR, 'pokemon.json'), 'utf8')) as Sheet
    const animacoes = new Set(Object.keys(sheet.animations ?? {}))

    const semSprite = new Set<string>()
    for (const region of registry.regions.values()) {
      for (const area of region.areas) {
        for (const especie of area.species) {
          // Uma espécie sem sprite aparece como marcador colorido; é degradação aceitável no
          // código, mas nunca deveria acontecer com conteúdo publicado.
          if (!animacoes.has(`${especie}/walk_south`)) semSprite.add(especie)
        }
      }
    }
    expect([...semSprite].sort()).toEqual([])
  })
})
