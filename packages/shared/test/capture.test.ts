import { describe, expect, it } from 'vitest'
import { captureChance, rollCapture } from '../src/capture.js'

describe('captureChance', () => {
  it('Charmander (45) com metade do HP e Poké Bola ≈ 12 %', () => {
    expect(captureChance({ captureRate: 45, hpMax: 100, hpCurrent: 50, ballBonus: 1 })).toBeCloseTo(30 / 255, 6)
  })
  it('Ultra Bola com 1 de HP ≈ 35 %', () => {
    expect(captureChance({ captureRate: 45, hpMax: 100, hpCurrent: 1, ballBonus: 2 })).toBeCloseTo(89 / 255, 6)
  })
  it('captureRate 255 com HP baixo e Ultra Bola satura em 1', () => {
    expect(captureChance({ captureRate: 255, hpMax: 100, hpCurrent: 1, ballBonus: 2 })).toBe(1)
  })
  it('valida HP', () => {
    expect(() => captureChance({ captureRate: 45, hpMax: 0, hpCurrent: 0, ballBonus: 1 })).toThrow(RangeError)
    expect(() => captureChance({ captureRate: 45, hpMax: 10, hpCurrent: 11, ballBonus: 1 })).toThrow(RangeError)
  })
})

describe('rollCapture', () => {
  const input = { captureRate: 45, hpMax: 100, hpCurrent: 50, ballBonus: 1 }
  it('compara o sorteio com a chance', () => {
    expect(rollCapture(input, { next: () => 0.1, int: () => 0, state: () => 0 })).toBe(true)
    expect(rollCapture(input, { next: () => 0.2, int: () => 0, state: () => 0 })).toBe(false)
  })
})
