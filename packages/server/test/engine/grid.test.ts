import { describe, expect, it } from 'vitest'
import { findPath, floodFrom, isAdjacent, manhattan, neighbors, pathFromFlood } from '../../src/engine/grid.js'

// mapa 5x5: '#' bloqueia
const rows = ['.....', '.###.', '.....', '.#.#.', '.....']
const blocked = (p: { x: number; y: number }) => rows[p.y]?.[p.x] === '#'
const at = (x: number, y: number) => ({ x, y })

describe('helpers', () => {
  it('manhattan e adjacência', () => {
    expect(manhattan(at(0, 0), at(3, 4))).toBe(7)
    expect(isAdjacent(at(1, 1), at(1, 2))).toBe(true)
    expect(isAdjacent(at(1, 1), at(2, 2))).toBe(false)
    expect(isAdjacent(at(1, 1), at(1, 1))).toBe(false)
  })
  it('neighbors devolve os 4 vizinhos ortogonais', () => {
    expect(neighbors(at(2, 2))).toEqual([at(2, 1), at(3, 2), at(2, 3), at(1, 2)])
  })
})

describe('findPath', () => {
  const base = { isBlocked: blocked, width: 5, height: 5 }
  it('contorna a parede até ficar adjacente ao alvo', () => {
    const target = at(2, 2)
    const path = findPath({ ...base, from: at(0, 0), target, isGoal: (p) => isAdjacent(p, target) })
    expect(path).not.toBeNull()
    expect(path!.at(-1)).toEqual(at(1, 2))
    expect(path).toHaveLength(3) // (0,1) (0,2) (1,2)
    for (const p of path!) expect(blocked(p)).toBe(false)
  })
  it('devolve [] quando a origem já satisfaz o objetivo', () => {
    expect(findPath({ ...base, from: at(1, 2), target: at(2, 2), isGoal: (p) => isAdjacent(p, at(2, 2)) })).toEqual([])
  })
  it('devolve null quando o alvo está cercado', () => {
    const walled = ['.....', '.###.', '.#.#.', '.###.', '.....']
    const b = (p: { x: number; y: number }) => walled[p.y]?.[p.x] === '#'
    expect(findPath({ from: at(0, 0), target: at(2, 2), isBlocked: b, isGoal: (p) => isAdjacent(p, at(2, 2)), width: 5, height: 5 })).toBeNull()
  })
  it('nunca sai do mapa nem entra em bloqueio, e a origem bloqueada não impede sair', () => {
    const path = findPath({ ...base, from: at(1, 1), target: at(4, 4), isBlocked: (p) => blocked(p) || (p.x === 1 && p.y === 1), isGoal: (p) => p.x === 4 && p.y === 4 })
    expect(path).not.toBeNull()
    for (const p of path!) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThan(5); expect(blocked(p)).toBe(false) }
  })
})

describe('floodFrom / pathFromFlood', () => {
  const width = 3
  const height = 3
  const isBlocked = (p: { x: number; y: number }) => p.x === 1 && p.y === 1

  it('calcula as distâncias corretas num 3x3 com o centro bloqueado', () => {
    const flood = floodFrom({ from: at(0, 0), isBlocked, width, height })
    const distAt = (x: number, y: number) => flood.dist.get(y * width + x)
    expect(distAt(0, 0)).toBe(0)
    expect(distAt(1, 0)).toBe(1)
    expect(distAt(0, 1)).toBe(1)
    expect(distAt(2, 0)).toBe(2)
    expect(distAt(0, 2)).toBe(2)
    expect(distAt(2, 1)).toBe(3)
    expect(distAt(1, 2)).toBe(3)
    expect(distAt(2, 2)).toBe(4)
    expect(flood.dist.has(1 * width + 1)).toBe(false) // tile bloqueado: inalcançável
  })

  it('pathFromFlood devolve o caminho sem a origem, e null se o alvo não foi alcançado', () => {
    const flood = floodFrom({ from: at(0, 0), isBlocked, width, height })
    expect(pathFromFlood(flood, at(0, 0), at(2, 2), width)).toEqual([at(1, 0), at(2, 0), at(2, 1), at(2, 2)])
    expect(pathFromFlood(flood, at(0, 0), at(0, 0), width)).toEqual([])
    expect(pathFromFlood(flood, at(0, 0), at(1, 1), width)).toBeNull()
  })
})
