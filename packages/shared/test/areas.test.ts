import { describe, expect, it } from 'vitest'
import { areaUnlockLevel, areasOfSpecies, canEnterArea, findArea } from '../src/areas.js'
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

  it('nenhuma área da segunda região abre abaixo do portão da região', () => {
    const portao = registry.unlocks.regions['terras-altas']!
    for (const area of registry.regions.get('terras-altas')!.areas) {
      expect(areaUnlockLevel(registry, area.id), area.id).toBeGreaterThanOrEqual(portao)
      expect(canEnterArea(registry, area.id, portao - 1), area.id).toBe(false)
    }
    // E a área de entrada abre exatamente no portão: o jogador que alcança o nível entra.
    expect(canEnterArea(registry, registry.regions.get('terras-altas')!.areas[0]!.id, portao)).toBe(true)
  })

  it('nenhuma área aparece em duas regiões', () => {
    const todas = [...registry.regions.values()].flatMap((r) => r.areas.map((a) => a.id))
    expect(new Set(todas).size).toBe(todas.length)
  })

  it('área desconhecida não tem portão: quem barra é o 404 de quem procura o mapa', () => {
    expect(areaUnlockLevel(registry, 'nao-existe')).toBe(0)
  })

  it('a primeira área é sempre alcançável por quem acabou de começar', () => {
    const primeira = registry.regions.get('kanto')!.areas[0]!
    expect(areaUnlockLevel(registry, primeira.id)).toBe(1)
  })
})

describe('onde uma espécie aparece', () => {
  const registry = loadRegistry()

  it('devolve toda área que lista a espécie, com a faixa de nível de cada uma', () => {
    const onde = areasOfSpecies(registry.regions, 'zubat')
    expect(onde.length, 'zubat mora em mais de uma área').toBeGreaterThan(1)
    for (const { region, area } of onde) {
      expect(area.species).toContain('zubat')
      expect(region.areas).toContain(area)
      expect(area.maxLevel).toBeGreaterThanOrEqual(area.minLevel)
    }
  })

  it('vem em ordem de porta de entrada: a área que se alcança antes vem primeiro', () => {
    const niveis = areasOfSpecies(registry.regions, 'zubat')
      .map(({ region, area }) => Math.max(region.minTrainerLevel, area.minTrainerLevel))
    expect(niveis).toEqual([...niveis].sort((a, b) => a - b))
  })

  it('espécie que não é selvagem em lugar nenhum devolve lista vazia, e não erro', () => {
    // Inicial e lendário chegam por outro caminho; a ficha precisa saber disso para dizer de onde vêm.
    const inicial = [...registry.species.values()].find((s) => s.obtainable === 'starter')
    expect(inicial, 'o registro precisa ter um inicial').toBeDefined()
    expect(areasOfSpecies(registry.regions, inicial!.name)).toEqual([])
    expect(areasOfSpecies(registry.regions, 'nao-existe')).toEqual([])
  })
})

/**
 * Os marcadores no mapa-múndi.
 *
 * O mapa deixou de ser o Town Map de 192×144 — um esquema de marcos, que cabia em qualquer lugar
 * porque não tinha o que mostrar — e passou a ser o mundo renderizado do servidor, em 796×892. As
 * dezesseis áreas foram recolocadas por busca de terreno, e estes casos seguram o que essa
 * recolocação pode quebrar sem ninguém ver.
 */
describe('os marcadores no mapa', () => {
  const regioes = [...loadRegistry().regions.values()]
  const todos = regioes.flatMap((r) => r.areas.map((a) => ({ id: a.id, ...a.noMapa })))

  it('toda área tem um ponto DENTRO do mapa', () => {
    // A posição é percentual: fora de 0–100 o marcador é desenhado fora da moldura, e some.
    expect(todos.length).toBeGreaterThan(0)
    for (const m of todos) {
      expect(m.x, m.id).toBeGreaterThanOrEqual(0)
      expect(m.x, m.id).toBeLessThanOrEqual(100)
      expect(m.y, m.id).toBeGreaterThanOrEqual(0)
      expect(m.y, m.id).toBeLessThanOrEqual(100)
    }
  })

  it('nenhum par de marcadores se sobrepõe, NA REGIÃO E ENTRE REGIÕES', () => {
    /*
     * O esquema confere dentro de cada região, e só. Kanto e Terras Altas dividem o MESMO mapa —
     * as Terras Altas são a Kanto tardia —, então dois marcadores de regiões diferentes podem cair
     * um sobre o outro sem o esquema reclamar. Na tela eles nunca aparecem juntos, mas duas áreas
     * no mesmo ponto é sinal de que a recolocação errou.
     */
    const perto: string[] = []
    for (let i = 0; i < todos.length; i++) {
      for (let j = i + 1; j < todos.length; j++) {
        const a = todos[i]!
        const b = todos[j]!
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (d < 4) perto.push(`${a.id} e ${b.id} a ${d.toFixed(1)}`)
      }
    }
    expect(perto).toEqual([])
  })

  it('o rótulo DESCREVE o lugar, em vez de nomear marco de Kanto que não existe no mapa', () => {
    /*
     * O mapa é o mundo do servidor, não a Kanto dos jogos: não há Pallet nem Cerulean nele. O
     * rótulo aparece no marcador ("Campo Inicial (campo a leste do lago central)"), e nomear ali um
     * lugar que não está no desenho é mentir para quem está olhando o desenho.
     */
    const marcosDeKanto = /pallet|cerulean|pewter|celadon|lavender|viridian|cinnabar|rota \d/i
    const mentindo = todos.filter((m) => marcosDeKanto.test(m.local)).map((m) => `${m.id}: ${m.local}`)
    expect(mentindo).toEqual([])
    for (const m of todos) expect(m.local.length, m.id).toBeGreaterThan(3)
  })
})
