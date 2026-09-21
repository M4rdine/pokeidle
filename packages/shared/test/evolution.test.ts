import { describe, expect, it } from 'vitest'
import type { Species } from '../src/index.js'
import { evolutionChain, nextEvolution } from '../src/evolution.js'
import { loadRegistry } from '../src/registry-full.js'

const base = { types: ['fire' as const], baseStats: { hp: 39, attack: 52, defense: 43, spAttack: 60, spDefense: 50, speed: 65 }, baseExperience: 62, growthRate: 'medium-slow' as const, captureRate: 45, learnset: [] }
const charmander: Species = { ...base, id: 4, name: 'charmander', evolvesTo: { species: 'charmeleon', level: 16 } }
const charmeleon: Species = { ...base, id: 5, name: 'charmeleon' }
const registry = { species: new Map([['charmander', charmander], ['charmeleon', charmeleon]]) }

describe('nextEvolution', () => {
  it('devolve o alvo a partir do nível de evolução', () => {
    expect(nextEvolution(charmander, 15, registry)).toBeUndefined()
    expect(nextEvolution(charmander, 16, registry)?.name).toBe('charmeleon')
    expect(nextEvolution(charmander, 99, registry)?.name).toBe('charmeleon')
  })
  it('espécie sem evolução devolve undefined', () => {
    expect(nextEvolution(charmeleon, 100, registry)).toBeUndefined()
  })
  it('lança se o alvo não existir no registro', () => {
    expect(() => nextEvolution(charmander, 16, { species: new Map() })).toThrow(/charmeleon/)
  })
})

describe('linha evolutiva inteira', () => {
  const registry = loadRegistry()

  it('devolve a linha do começo ao fim, não importa por qual estágio se pergunte', () => {
    const esperada = ['charmander', 'charmeleon', 'charizard']
    for (const estagio of esperada) {
      expect(evolutionChain(registry, estagio).map((s) => s.name), estagio).toEqual(esperada)
    }
  })

  it('espécie sem evolução é uma linha de um só', () => {
    // butterfree não evolui nem tem estágio anterior neste registro: a linha é ela mesma.
    expect(evolutionChain(registry, 'butterfree').map((s) => s.name)).toEqual(['butterfree'])
  })

  it('espécie desconhecida devolve linha vazia, em vez de erro', () => {
    expect(evolutionChain(registry, 'nao-existe')).toEqual([])
  })

  it('não entra em laço se o conteúdo declarar uma evolução circular', () => {
    // Guarda contra dado errado: uma linha que volta para si mesma travaria a tela inteira.
    const a = { ...registry.species.get('butterfree')!, name: 'a', evolvesTo: { species: 'b', level: 2 } }
    const b = { ...a, name: 'b', evolvesTo: { species: 'a', level: 3 } }
    const circular = { species: new Map([['a', a], ['b', b]]) }
    // Numa linha circular não existe raiz verdadeira, então qual estágio abre a lista é
    // arbitrário. O que precisa valer é que termina e não repete ninguém.
    const linha = evolutionChain(circular, 'a').map((s) => s.name)
    expect(linha).toHaveLength(2)
    expect(new Set(linha)).toEqual(new Set(['a', 'b']))
  })
})
