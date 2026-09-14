import { describe, expect, it } from 'vitest'
import { findPath, isAdjacent, manhattan, neighbors } from '../../src/engine/grid.js'

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
