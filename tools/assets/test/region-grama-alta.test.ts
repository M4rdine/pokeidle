import { describe, expect, it } from 'vitest'
import { desenharRegiao, GRADE } from '../src/region-draw.js'
import { REGIOES, regiaoPorId } from '../src/regioes.js'
import type { RegionSpec } from '../src/regioes.js'

const todos = (): boolean => true

interface Spawn { readonly area: string; readonly x: number; readonly y: number }

/**
 * Centro de cada retângulo de spawn, em tiles, junto da área a que pertence. Os objetos saem em
 * ordem — a área e depois o que há nela —, que é como o importador também os lê.
 */
function spawns(regiao: RegionSpec): Spawn[] {
  const achados: Spawn[] = []
  let area = ''
  for (const o of desenharRegiao(regiao, todos).objetos) {
    if (o.classe === 'area') { area = o.nome; continue }
    if (o.classe !== 'spawn') continue
    achados.push({
      area,
      x: Math.floor((o.x + o.width / 2) / GRADE.tileSize),
      y: Math.floor((o.y + o.height / 2) / GRADE.tileSize),
    })
  }
  return achados
}

const biomaDe = (regiao: RegionSpec, id: string) => regiao.biomas.find((b) => b.id === id)!
/** O pincel de grama alta só casa com campo: é o material que os dois conjuntos têm em comum. */
const ehCampo = (regiao: RegionSpec, id: string): boolean => biomaDe(regiao, id).set.startsWith('campo-')

describe('grama alta onde há selvagem', () => {
  it.each(REGIOES.map((r) => [r.id, r] as const))('em %s todo spawn de campo nasce em grama alta', (_id, regiao) => {
    const draft = desenharRegiao(regiao, todos)
    const deCampo = spawns(regiao).filter((s) => ehCampo(regiao, s.area))
    expect(deCampo.length, 'a região precisa ter spawns em campo').toBeGreaterThan(0)
    for (const { area, x, y } of deCampo) {
      // O mapa vira informação: quem olha vê onde os Pokémon aparecem, em vez de descobrir andando.
      // Basta a zona estar marcada — a trilha atravessa a mancha, e é assim que tem que ser.
      let achou = false
      for (let dy = -2; dy <= 2 && !achou; dy++) {
        for (let dx = -2; dx <= 2 && !achou; dx++) {
          achou = draft.ground[(y + dy) * GRADE.width + x + dx]?.startsWith('campo-alta-bbbb') === true
        }
      }
      expect(achou, `spawn de ${area} em (${x},${y}) sem grama alta por perto`).toBe(true)
    }
  })

  it('caverna e praia ficam de fora: grama alta em piso de rocha ou areia seria mentira', () => {
    const kanto = regiaoPorId('kanto')!
    const draft = desenharRegiao(kanto, todos)
    const foraDeCampo = spawns(kanto).filter((s) => !ehCampo(kanto, s.area))
    expect(foraDeCampo.length, 'Kanto tem caverna e praia').toBeGreaterThan(0)
    for (const { area, x, y } of foraDeCampo) {
      expect(draft.ground[y * GRADE.width + x]!, `spawn de ${area} em (${x},${y})`).not.toMatch(/^campo-alta/)
    }
  })

  it('a grama alta é mancha, não área inteira: sobra campo em volta', () => {
    const draft = desenharRegiao(REGIOES[0]!, todos)
    const alta = draft.ground.filter((n) => n.startsWith('campo-alta-bbbb')).length
    expect(alta).toBeGreaterThan(0)
    expect(alta / (GRADE.width * GRADE.height)).toBeLessThan(0.35)
  })

  it('grama alta não bloqueia: ela é para andar dentro', () => {
    const kanto = regiaoPorId('kanto')!
    const draft = desenharRegiao(kanto, todos)
    for (const { area, x, y } of spawns(kanto).filter((s) => ehCampo(kanto, s.area))) {
      expect(draft.blocked[y * GRADE.width + x], `spawn de ${area} em (${x},${y})`).toBe(false)
    }
  })
})
