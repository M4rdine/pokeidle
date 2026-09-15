import { Container, Graphics, Text, type Ticker } from 'pixi.js'

export type Updater = (dtMs: number) => boolean // devolve false quando termina

export function createEffectRunner(ticker: Ticker): { add(u: Updater): void; destroy(): void } {
  let updaters: Updater[] = []
  const tick = (t: Ticker): void => {
    const dt = t.deltaMS
    updaters = updaters.filter((u) => u(dt))
  }
  ticker.add(tick)
  return {
    add: (u) => { updaters = [...updaters, u] },
    destroy: () => { ticker.remove(tick); updaters = [] },
  }
}

const over = (ms: number, fn: (k: number) => void, done?: () => void): Updater => {
  let t = 0
  return (dt) => {
    t += dt
    const k = Math.min(1, t / ms)
    fn(k)
    if (k >= 1) { done?.(); return false }
    return true
  }
}

/** Avança 8 px na direção (dx, dy) e volta, em 150 ms. */
export const lunge = (target: Container, dx: number, dy: number): Updater => {
  const x0 = target.x
  const y0 = target.y
  return over(150, (k) => {
    const a = Math.sin(k * Math.PI) * 8
    target.x = x0 + dx * a
    target.y = y0 + dy * a
  }, () => { target.x = x0; target.y = y0 })
}

export const flash = (target: Container, color = 0xffffff, ms = 100): Updater => {
  const t = target.tint
  target.tint = color
  return over(ms, () => {}, () => { target.tint = t })
}

export const shake = (target: Container, px = 2, ms = 120): Updater => {
  const x0 = target.x
  return over(ms, (k) => {
    target.x = k < 1 ? x0 + (Math.round(k * 6) % 2 === 0 ? px : -px) : x0
  }, () => { target.x = x0 })
}

export const fadeOut = (target: Container, ms = 300, done?: () => void): Updater =>
  over(ms, (k) => { target.alpha = 1 - k }, done)

/** Texto flutuante: sobe 24 px e some em 600 ms. */
export function floatingText(layer: Container, x: number, y: number, text: string, color: number, size = 12): Updater {
  const t = new Text({ text, style: { fontSize: size, fill: color, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } } })
  t.anchor.set(0.5, 1)
  t.x = x
  t.y = y
  layer.addChild(t)
  return over(600, (k) => { t.y = y - 24 * k; t.alpha = 1 - k * k }, () => { t.destroy() })
}

/** Anel dourado (level up) ou brilho circular colorido (captura, poção, cura). */
export function ring(layer: Container, x: number, y: number, color: number, ms = 600, radius = 20): Updater {
  const g = new Graphics()
  layer.addChild(g)
  return over(ms, (k) => {
    g.clear().circle(x, y - 12, radius * (0.5 + k)).stroke({ width: 3, color, alpha: 1 - k })
  }, () => { g.destroy() })
}
