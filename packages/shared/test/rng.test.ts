import { describe, expect, it } from 'vitest'
import { createRng } from '../src/rng.js'

describe('createRng', () => {
  it('é determinístico para a mesma seed', () => {
    const a = createRng(42), b = createRng(42)
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])
  })
  it('seeds diferentes divergem', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next())
  })
  it('next fica em [0,1)', () => {
    const r = createRng(7)
    for (let i = 0; i < 10_000; i++) { const v = r.next(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1) }
  })
  it('int é inclusivo nos dois lados e cobre a faixa', () => {
    const r = createRng(3)
    const seen = new Set<number>()
    for (let i = 0; i < 5_000; i++) seen.add(r.int(1, 6))
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6])
  })
  it('int com min === max devolve min', () => {
    expect(createRng(1).int(5, 5)).toBe(5)
  })
  it('int lança se min > max', () => {
    expect(() => createRng(1).int(6, 5)).toThrow(RangeError)
  })
})
