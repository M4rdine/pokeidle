import { describe, expect, it } from 'vitest'
import { createTween, directionOf, isDone, positionAt, retarget } from '../../src/scene/interpolate.js'

describe('tween entre tiles', () => {
  const tw = createTween({ x: 0, y: 0 }, { x: 1, y: 0 }, 1000, 200)
  it('t = 0, 100, 200 ms e além', () => {
    expect(positionAt(tw, 1000)).toEqual({ x: 0, y: 0 })
    expect(positionAt(tw, 1100)).toEqual({ x: 0.5, y: 0 })
    expect(positionAt(tw, 1200)).toEqual({ x: 1, y: 0 })
    expect(positionAt(tw, 1500)).toEqual({ x: 1, y: 0 })
    expect(isDone(tw, 1199)).toBe(false)
    expect(isDone(tw, 1200)).toBe(true)
  })
  it('alvo novo no meio salta ao alvo anterior e recomeça (o servidor prevalece)', () => {
    const next = retarget(tw, { x: 1, y: 1 }, 1100)
    expect(next).toEqual({ from: { x: 1, y: 0 }, to: { x: 1, y: 1 }, startMs: 1100, durationMs: 200 })
    expect(positionAt(next, 1100)).toEqual({ x: 1, y: 0 })
  })
  it('direção pelo delta', () => {
    expect(directionOf({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe('east')
    expect(directionOf({ x: 0, y: 0 }, { x: -1, y: 0 })).toBe('west')
    expect(directionOf({ x: 0, y: 0 }, { x: 0, y: -1 })).toBe('north')
    expect(directionOf({ x: 0, y: 0 }, { x: 0, y: 2 })).toBe('south')
    expect(directionOf({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe('south')
  })
})
