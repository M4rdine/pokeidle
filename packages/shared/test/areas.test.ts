import { describe, expect, it } from 'vitest'
import { areaUnlockLevel, findArea } from '../src/areas.js'
import { loadRegistry } from '../src/registry-full.js'

const registry = loadRegistry()
const areaDe = (id: string) => registry.regions.get('kanto')!.areas.find((a) => a.id === id)!

describe('portão de nível por área', () => {
  it('findArea devolve a área e a região dela', () => {
    const achado = findArea(registry.regions, 'caverna-funda')!
    expect(achado.region.id).toBe('kanto')
    expect(achado.area.id).toBe('caverna-funda')
    expect(findArea(registry.regions, 'nao-existe')).toBeNull()
  })

  it('a exigência da área é a maior entre a da região e a da própria área', () => {
    // Kanto abre no nível 1, então quem manda é a área.
    expect(areaUnlockLevel(registry, 'campo-inicial')).toBe(areaDe('campo-inicial').minTrainerLevel)
    expect(areaUnlockLevel(registry, 'pico-rochoso')).toBe(areaDe('pico-rochoso').minTrainerLevel)
    expect(areaUnlockLevel(registry, 'pico-rochoso')).toBeGreaterThan(areaUnlockLevel(registry, 'campo-inicial'))
  })

  it('região com portão alto levanta o de todas as áreas dela', () => {
    const comPortao = (nivel: number) => ({
      ...registry,
      unlocks: { ...registry.unlocks, regions: { ...registry.unlocks.regions, kanto: nivel } },
    })
    // Portão da região acima de qualquer área: ele passa a valer para todas.
    expect(areaUnlockLevel(comPortao(40), 'campo-inicial')).toBe(40)
    expect(areaUnlockLevel(comPortao(40), 'pico-rochoso')).toBe(40)
    // Portão da região no meio: a área mais exigente continua mandando.
    expect(areaUnlockLevel(comPortao(10), 'campo-inicial')).toBe(10)
    expect(areaUnlockLevel(comPortao(10), 'pico-rochoso')).toBe(areaDe('pico-rochoso').minTrainerLevel)
  })

  it('área desconhecida não tem portão: quem barra é o 404 de quem procura o mapa', () => {
    expect(areaUnlockLevel(registry, 'nao-existe')).toBe(0)
  })

  it('a primeira área é sempre alcançável por quem acabou de começar', () => {
    const primeira = registry.regions.get('kanto')!.areas[0]!
    expect(areaUnlockLevel(registry, primeira.id)).toBe(1)
  })
})
