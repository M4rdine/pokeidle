import { describe, expect, it } from 'vitest'
import { desenharRegiao, GRADE } from '../src/region-draw.js'
import { REGIOES, regiaoPorId } from '../src/regioes.js'
import type { RegionSpec } from '../src/regioes.js'

const todos = (): boolean => true

interface Pontos { readonly area: string; readonly porta: { x: number; y: number }; readonly alvos: { x: number; y: number }[] }

function pontosPorArea(regiao: RegionSpec): Pontos[] {
  const areas = new Map<string, { porta: { x: number; y: number }; alvos: { x: number; y: number }[] }>()
  let atual = ''
  for (const o of desenharRegiao(regiao, todos).objetos) {
    if (o.classe === 'area') { atual = o.nome; areas.set(atual, { porta: { x: 0, y: 0 }, alvos: [] }); continue }
    const entrada = areas.get(atual)!
    const tile = (v: number, tamanho = 0): number => Math.floor((v + tamanho / 2) / GRADE.tileSize)
    if (o.classe === 'pokecenter') entrada.porta = { x: tile(o.x), y: tile(o.y) }
    if (o.classe === 'spawn') entrada.alvos.push({ x: tile(o.x, o.width), y: tile(o.y, o.height) })
  }
  return [...areas].map(([area, v]) => ({ area, ...v }))
}

const temTrilha = (regiao: RegionSpec, area: string): boolean =>
  regiao.biomas.find((b) => b.id === area)!.trilha !== null

describe('a trilha liga o que interessa', () => {
  it.each(REGIOES.map((r) => [r.id, r] as const))('em %s a trilha chega na porta do Centro', (_id, regiao) => {
    const draft = desenharRegiao(regiao, todos)
    for (const { area, porta } of pontosPorArea(regiao).filter((p) => temTrilha(regiao, p.area))) {
      const trilha = regiao.biomas.find((b) => b.id === area)!.trilha!
      // A porta é o fim do caminho: quem cura chega por ela, e o prédio fica logo acima.
      expect(draft.ground[porta.y * GRADE.width + porta.x]!, `${area}: porta`).toMatch(new RegExp(`^${trilha}-`))
    }
  })

  it('a trilha passa por toda zona de spawn: ela liga onde se caça a onde se cura', () => {
    const kanto = regiaoPorId('kanto')!
    const draft = desenharRegiao(kanto, todos)
    const PERTO = 3
    for (const { area, alvos } of pontosPorArea(kanto).filter((p) => temTrilha(kanto, p.area))) {
      const trilha = kanto.biomas.find((b) => b.id === area)!.trilha!
      for (const alvo of alvos) {
        let achou = false
        for (let dy = -PERTO; dy <= PERTO && !achou; dy++) {
          for (let dx = -PERTO; dx <= PERTO && !achou; dx++) {
            achou = draft.ground[(alvo.y + dy) * GRADE.width + alvo.x + dx]?.startsWith(`${trilha}-`) === true
          }
        }
        expect(achou, `${area}: spawn em (${alvo.x},${alvo.y}) sem trilha a ${PERTO} tiles`).toBe(true)
      }
    }
  })
})
