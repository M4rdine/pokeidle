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
    expect(cameraStep({ x: 700, y: 500 }, { x: 5000, y: 5000 }, viewport, world, 2)).toEqual({ x: 700 + (880 - 700) * 0.15, y: 500 + (660 - 500) * 0.15 }) // com zoom 2x a janela cobre metade do mundo; lerp de 15% sobre o alvo já clampado
  })
  it('converge para a borda sem ultrapassar', () => {
    let cam = { x: 0, y: 0 }
    for (let i = 0; i < 200; i += 1) {
      cam = cameraStep(cam, { x: 5000, y: 5000 }, viewport, world, 1)
      expect(cam.x).toBeLessThanOrEqual(480)
      expect(cam.y).toBeLessThanOrEqual(360)
    }
    expect(Math.abs(cam.x - 480)).toBeLessThan(0.5)
    expect(Math.abs(cam.y - 360)).toBeLessThan(0.5)
  })
  it('trocar o zoom de 1 para 2 com a câmera fora da nova faixa clampa no mesmo frame', () => {
    const cam = cameraStep({ x: 900, y: 700 }, { x: 640, y: 480 }, viewport, world, 2)
    expect(cam.x).toBeLessThanOrEqual(880)
    expect(cam.y).toBeLessThanOrEqual(660)
  })
})
