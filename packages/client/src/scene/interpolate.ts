import { TICK_MS } from '../config.js'

export interface Point { readonly x: number; readonly y: number }
export type Direction = 'north' | 'south' | 'east' | 'west'
export interface Tween { readonly from: Point; readonly to: Point; readonly startMs: number; readonly durationMs: number }

export const createTween = (from: Point, to: Point, startMs: number, durationMs = TICK_MS): Tween => ({ from, to, startMs, durationMs })

export function positionAt(t: Tween, nowMs: number): Point {
  const k = t.durationMs <= 0 ? 1 : Math.min(1, Math.max(0, (nowMs - t.startMs) / t.durationMs))
  return { x: t.from.x + (t.to.x - t.from.x) * k, y: t.from.y + (t.to.y - t.from.y) * k }
}

export const isDone = (t: Tween, nowMs: number): boolean => nowMs - t.startMs >= t.durationMs

/** Alvo novo antes do fim: salta ao alvo anterior e recomeça (o servidor prevalece). */
export const retarget = (t: Tween, to: Point, nowMs: number): Tween => ({ from: t.to, to, startMs: nowMs, durationMs: t.durationMs })

export function directionOf(from: Point, to: Point): Direction {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'east' : 'west'
  if (dy < 0) return 'north'
  return 'south'
}
