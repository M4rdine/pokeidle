import type { Point } from './interpolate.js'

export interface Camera { readonly x: number; readonly y: number }
export interface Size { readonly w: number; readonly h: number }

// Fora da faixa válida (alvo perto da borda do mundo), a câmera salta direto ao limite —
// só faz lerp suave quando o alvo centrado já cabe dentro de [0, world - view].
const axis = (cam: number, target: number, view: number, world: number, lerp: number): number => {
  if (world <= view) return (world - view) / 2
  const bound = world - view
  const raw = target - view / 2
  if (raw < 0) return 0
  if (raw > bound) return bound
  return Math.min(bound, Math.max(0, cam + (raw - cam) * lerp))
}

/** `cam` em px do mundo (canto superior esquerdo da janela). O lerp é sobre o alvo já clampado. */
export function cameraStep(cam: Camera, target: Point, viewport: Size, world: Size, zoom: number, lerp = 0.15): Camera {
  const view = { w: viewport.w / zoom, h: viewport.h / zoom }
  return { x: axis(cam.x, target.x, view.w, world.w, lerp), y: axis(cam.y, target.y, view.h, world.h, lerp) }
}
