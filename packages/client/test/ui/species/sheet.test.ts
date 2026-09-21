import { areasOfSpecies, loadRegistry } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { createContext, type AppContext } from '../../../src/app-context.js'
import { emptyHuntView } from '../../../src/state/hunt-view.js'
import { initialSession } from '../../../src/state/session.js'
import { createStore } from '../../../src/state/store.js'
import { speciesSheet } from '../../../src/ui/species/sheet.js'

const registry = loadRegistry()
const ctx = (): AppContext => createContext({
  registry,
  session: createStore(initialSession()),
  hunt: createStore(emptyHuntView()),
})

const texto = (node: HTMLElement): string => node.textContent ?? ''

describe('ficha de espécie', () => {
  it('identifica a espécie: nome, número e tipos', () => {
    const charizard = registry.species.get('charizard')!
    const ficha = speciesSheet(ctx(), 'charizard')
    expect(texto(ficha)).toContain('Charizard')
    expect(texto(ficha)).toContain(`#${charizard.id}`)
    for (const tipo of charizard.types) {
      expect(ficha.querySelector(`.type-${tipo}`), tipo).not.toBeNull()
    }
  })

  it('mostra os seis atributos-base com o número de cada um', () => {
    const base = registry.species.get('charizard')!.baseStats
    const ficha = speciesSheet(ctx(), 'charizard')
    const linhas = [...ficha.querySelectorAll('[data-stat]')]
    expect(linhas).toHaveLength(6)
    expect(ficha.querySelector('[data-stat=hp]')?.textContent).toContain(String(base.hp))
    expect(ficha.querySelector('[data-stat=speed]')?.textContent).toContain(String(base.speed))
  })

  it('diz onde a espécie aparece, com a faixa de nível de cada área', () => {
    const onde = areasOfSpecies(registry.regions, 'zubat')
    expect(onde.length, 'zubat precisa ser caçável').toBeGreaterThan(0)
    const ficha = speciesSheet(ctx(), 'zubat')
    const itens = [...ficha.querySelectorAll('[data-area]')]
    expect(itens).toHaveLength(onde.length)
    const primeira = onde[0]!
    const item = ficha.querySelector(`[data-area="${primeira.area.id}"]`)!
    expect(item.textContent).toContain(primeira.area.name)
    expect(item.textContent).toContain(`${primeira.area.minLevel}`)
  })

  it('espécie que não é selvagem diz de onde vem, em vez de mostrar lista vazia', () => {
    const inicial = [...registry.species.values()].find((s) => s.obtainable === 'starter')!
    const ficha = speciesSheet(ctx(), inicial.name)
    expect(ficha.querySelectorAll('[data-area]')).toHaveLength(0)
    expect(texto(ficha).toLowerCase()).toContain('inicial')
  })

  it('mostra a linha evolutiva com o nível de cada passagem', () => {
    const ficha = speciesSheet(ctx(), 'charmeleon')
    const estagios = [...ficha.querySelectorAll('[data-evo]')].map((n) => n.getAttribute('data-evo'))
    expect(estagios).toEqual(['charmander', 'charmeleon', 'charizard'])
    // O estágio aberto se destaca dos outros: a linha é contexto, não navegação.
    expect(ficha.querySelector('[data-evo=charmeleon]')?.classList.contains('evo-atual')).toBe(true)
    expect(texto(ficha)).toContain(String(registry.species.get('charmander')!.evolvesTo!.level))
  })

  it('lista os golpes que a espécie aprende, com o nível de cada um', () => {
    const learnset = registry.species.get('charizard')!.learnset
    const ficha = speciesSheet(ctx(), 'charizard')
    const linhas = [...ficha.querySelectorAll('[data-learn]')]
    expect(linhas).toHaveLength(learnset.length)
    expect(linhas[0]?.textContent).toContain(String(learnset[0]!.level))
  })

  it('espécie desconhecida devolve um aviso, e não uma ficha quebrada', () => {
    const ficha = speciesSheet(ctx(), 'nao-existe')
    expect(texto(ficha).toLowerCase()).toContain('não')
    expect(ficha.querySelectorAll('[data-stat]')).toHaveLength(0)
  })
})

describe('o portão de nível diz se dá para ir agora', () => {
  const zubat = 'zubat'
  const comNivel = (xp: number): AppContext => createContext({
    registry,
    session: createStore(initialSession()),
    hunt: createStore({ ...emptyHuntView(), state: { trainer: { xp, gold: 0 } } as never }),
  })

  it('área fora de alcance acende; área já liberada fica apagada', () => {
    const doZero = speciesSheet(comNivel(0), zubat)
    const portas = [...doZero.querySelectorAll('.area-porta')]
    expect(portas.length).toBeGreaterThan(0)
    // Nível 1 alcança a primeira área e não as de nível alto: as duas leituras têm que existir.
    expect(portas.some((p) => p.classList.contains('porta-longe'))).toBe(true)
    expect(portas.some((p) => !p.classList.contains('porta-longe'))).toBe(true)
  })
})
