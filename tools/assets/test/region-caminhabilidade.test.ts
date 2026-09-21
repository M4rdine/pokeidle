import { describe, expect, it } from 'vitest'
import { desenharRegiao, GRADE } from '../src/region-draw.js'
import { REGIOES } from '../src/regioes.js'
import type { RegionSpec } from '../src/regioes.js'

const todos = (): boolean => true

interface Pontos { readonly area: string; readonly partida: number; readonly centro: number; readonly spawns: number[] }

/** Índices de grade da partida, da porta do Centro e de cada alvo de spawn, por área. */
function pontosPorArea(regiao: RegionSpec): Pontos[] {
  const draft = desenharRegiao(regiao, todos)
  const porArea = new Map<string, { partida: number; centro: number; spawns: number[] }>()
  let atual = ''
  const indice = (x: number, y: number, w = 0, h = 0): number =>
    Math.floor((y + h / 2) / GRADE.tileSize) * GRADE.width + Math.floor((x + w / 2) / GRADE.tileSize)
  for (const o of draft.objetos) {
    if (o.classe === 'area') { atual = o.nome; porArea.set(atual, { partida: -1, centro: -1, spawns: [] }); continue }
    const e = porArea.get(atual)!
    if (o.classe === 'spawnPoint') e.partida = indice(o.x, o.y)
    if (o.classe === 'pokecenter') e.centro = indice(o.x, o.y)
    if (o.classe === 'spawn') e.spawns.push(indice(o.x, o.y, o.width, o.height))
  }
  return [...porArea].map(([area, v]) => ({ area, ...v }))
}

/** Tudo que se alcança a pé a partir de `de`, sem sair do retângulo da área. */
function alcancavel(bloqueado: readonly boolean[], de: number, indice: number): Set<number> {
  const porLinha = Math.floor(GRADE.width / GRADE.areaWidth)
  const ax = (indice % porLinha) * GRADE.areaWidth
  const ay = Math.floor(indice / porLinha) * GRADE.areaHeight
  const dentro = (i: number): boolean => {
    const x = i % GRADE.width
    const y = Math.floor(i / GRADE.width)
    return x >= ax && x < ax + GRADE.areaWidth && y >= ay && y < ay + GRADE.areaHeight
  }
  const vistos = new Set<number>([de])
  const fila = [de]
  while (fila.length > 0) {
    const i = fila.pop()!
    for (const v of [i - 1, i + 1, i - GRADE.width, i + GRADE.width]) {
      if (vistos.has(v) || v < 0 || v >= bloqueado.length) continue
      // Sem esta guarda a vizinhança daria a volta na linha e ligaria bordas opostas.
      if (Math.abs((v % GRADE.width) - (i % GRADE.width)) > 1) continue
      if (!dentro(v) || bloqueado[v] === true) continue
      vistos.add(v)
      fila.push(v)
    }
  }
  return vistos
}

/**
 * A garantia que faltava. Uma área onde a partida não alcança o Centro é uma área onde o time
 * fica preso e o jogo trava sem erro nenhum — e é justamente o risco de mexer no terreno das
 * bordas. O teste existe para que essa mudança possa ser feita.
 */
describe('toda área é caminhável de ponta a ponta', () => {
  it.each(REGIOES.map((r) => [r.id, r] as const))('em %s a partida alcança o Centro e todo spawn', (_id, regiao) => {
    const draft = desenharRegiao(regiao, todos)
    const pontos = pontosPorArea(regiao)
    expect(pontos).toHaveLength(regiao.biomas.length)

    pontos.forEach((p, indice) => {
      expect(p.partida, `${p.area}: sem ponto de partida`).toBeGreaterThanOrEqual(0)
      expect(p.centro, `${p.area}: sem Centro`).toBeGreaterThanOrEqual(0)
      const daPartida = alcancavel(draft.blocked, p.partida, indice)
      expect(daPartida.has(p.centro), `${p.area}: o Centro é inalcançável a pé`).toBe(true)
      for (const spawn of p.spawns) {
        expect(daPartida.has(spawn), `${p.area}: spawn em ${spawn} é inalcançável a pé`).toBe(true)
      }
    })
  })
})
