import { describe, expect, it } from 'vitest'
import { createTween, positionAt } from '../../src/scene/interpolate.js'
import { hpColor, nextTween } from '../../src/scene/tweening.js'

describe('nextTween', () => {
  it('tween terminado começa do ponto de partida informado', () => {
    const done = createTween({ x: 0, y: 0 }, { x: 1, y: 0 }, 0, 200)
    const next = nextTween(done, { x: 1, y: 0 }, { x: 2, y: 0 }, 1000)
    expect(next).toEqual({ from: { x: 1, y: 0 }, to: { x: 2, y: 0 }, startMs: 1000, durationMs: 200 })
  })
  it('tween em andamento salta ao alvo anterior e recomeça de lá', () => {
    const running = createTween({ x: 0, y: 0 }, { x: 1, y: 0 }, 1000, 200)
    const next = nextTween(running, { x: 0, y: 0 }, { x: 1, y: 1 }, 1100)
    expect(next.from).toEqual({ x: 1, y: 0 })
    expect(positionAt(next, 1100)).toEqual({ x: 1, y: 0 })
  })
})

describe('hpColor', () => {
  it('muda de faixa em 50 % e 25 %', () => {
    expect(hpColor(10, 10)).toBe(0x44dd66)
    expect(hpColor(5, 10)).toBe(0xffcc00)
    expect(hpColor(2, 10)).toBe(0xdd4444)
    expect(hpColor(0, 0)).toBe(0xdd4444)
  })
})
