/**
 * A evolução por PEDRA — o segundo caminho, e o que conserta três linhas quebradas.
 *
 * O registro tem 42 espécies e dez evoluções, todas por nível. Raichu, Arcanine e Wigglytuff
 * estão lá e não há NADA ligando eles a Pikachu, Growlithe e Jigglypuff: essas três espécies
 * simplesmente não evoluem, em nenhum nível, para sempre. Não é um número mal escolhido — é a
 * ausência de um caminho, porque na série essas linhas nunca dependeram de nível.
 */
import { describe, expect, it } from 'vitest'
import { loadRegistry } from '../src/registry-full.js'
import { nextEvolution, evolutionChain } from '../src/evolution.js'

const registry = loadRegistry()
const de = (nome: string) => registry.species.get(nome)!

describe('evolução por pedra', () => {
  it('as três linhas que dependiam de pedra agora existem no registro', () => {
    for (const [origem, destino, pedra] of [
      ['pikachu', 'raichu', 'thunder-stone'],
      ['growlithe', 'arcanine', 'fire-stone'],
      ['jigglypuff', 'wigglytuff', 'moon-stone'],
    ] as const) {
      const evo = de(origem).evolvesTo
      expect(evo, origem).toBeDefined()
      expect(evo!.species, origem).toBe(destino)
      expect('item' in evo!, `${origem} evolui por item`).toBe(true)
      expect((evo as { item: string }).item, origem).toBe(pedra)
    }
  })

  it('quem evolui por pedra NUNCA evolui por nível, nem no nível cem', () => {
    // É o ponto do desenho. Se o nível também servisse, a pedra seria um atalho opcional e a
    // decisão do jogador (gastar ouro agora ou esperar) deixaria de existir.
    for (const nome of ['pikachu', 'growlithe', 'jigglypuff']) {
      expect(nextEvolution(de(nome), 100, registry), nome).toBeUndefined()
    }
  })

  it('quem evolui por nível continua evoluindo por nível', () => {
    expect(nextEvolution(de('charmander'), 16, registry)?.name).toBe('charmeleon')
    expect(nextEvolution(de('charmander'), 15, registry)).toBeUndefined()
  })

  it('a linha evolutiva enxerga o elo de pedra como enxerga o de nível', () => {
    // A ficha da espécie desenha a cadeia a partir daqui: sem isto, o Pikachu apareceria sozinho
    // e o Raichu também, como se não tivessem relação nenhuma.
    expect(evolutionChain(registry, 'raichu').map((s) => s.name)).toEqual(['pikachu', 'raichu'])
    expect(evolutionChain(registry, 'pikachu').map((s) => s.name)).toEqual(['pikachu', 'raichu'])
  })

  it('toda pedra citada por uma espécie existe como item do registro', () => {
    // Um `item` escrito errado não quebra nada: a evolução simplesmente nunca acontece, e o
    // jogador fica com uma pedra que não serve para nada sem nenhum erro em lugar nenhum.
    const pedras = [...registry.species.values()]
      .map((s) => s.evolvesTo)
      .filter((e): e is { species: string; item: string } => e !== undefined && 'item' in e)
      .map((e) => e.item)
    expect(pedras.length).toBeGreaterThan(0)
    for (const pedra of pedras) {
      expect(registry.items.get(pedra), pedra).toBeDefined()
      expect(registry.items.get(pedra)!.kind, pedra).toBe('stone')
    }
  })
})
