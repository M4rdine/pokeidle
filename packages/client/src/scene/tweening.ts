import { createTween, isDone, retarget, type Point, type Tween } from './interpolate.js'

/** Decide entre começar um tween novo e reaproveitar o atual: é a regra que a cena aplica por tique. */
export function nextTween(current: Tween, from: Point, to: Point, nowMs: number): Tween {
  return isDone(current, nowMs) ? createTween(from, to, nowMs) : retarget(current, to, nowMs)
}

/** Cor da barra de HP por faixa (verde acima de 50 %, amarelo acima de 25 %, vermelho abaixo). */
export function hpColor(hp: number, hpMax: number): number {
  const fraction = hpMax > 0 ? Math.max(0, hp / hpMax) : 0
  return fraction > 0.5 ? 0x44dd66 : fraction > 0.25 ? 0xffcc00 : 0xdd4444
}
