import { describe, expect, it } from 'vitest'
import { cameraStep } from '../../src/scene/camera.js'

describe('cameraStep', () => {
  const world = { w: 1280, h: 960 }
  const viewport = { w: 800, h: 600 }
  it('aproxima 15 % do alvo centrado por frame', () => {
    const cam = cameraStep({ x: 0, y: 0 }, { x: 640, y: 480 }, viewport, world, 1)
    expect(cam).toEqual({ x: 0.15 * (640 - 400), y: 0.15 * (480 - 300) })
  })
  it('clamp nas bordas e mundo menor que a janela centralizado (com zoom)', () => {
    expect(cameraStep({ x: 1000, y: 1000 }, { x: 5000, y: 5000 }, viewport, world, 1)).toEqual({ x: 1280 - 800, y: 960 - 600 })
    expect(cameraStep({ x: -50, y: -50 }, { x: 0, y: 0 }, viewport, world, 1)).toEqual({ x: 0, y: 0 })
    expect(cameraStep({ x: 0, y: 0 }, { x: 10, y: 10 }, viewport, { w: 400, h: 300 }, 1)).toEqual({ x: -200, y: -150 })
    expect(cameraStep({ x: 700, y: 500 }, { x: 5000, y: 5000 }, viewport, world, 2)).toEqual({ x: 1280 - 400, y: 960 - 300 }) // com zoom 2x a janela cobre metade do mundo
  })
})
