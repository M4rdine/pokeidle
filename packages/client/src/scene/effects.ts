import { ColorMatrixFilter, Container, Graphics, Text, type Ticker } from 'pixi.js'

export type Updater = (dtMs: number) => boolean // devolve false quando termina

const MAX_ACTIVE_EFFECTS = 200

export function createEffectRunner(ticker: Ticker): { add(u: Updater): void; destroy(): void } {
  let updaters: Updater[] = []
  const tick = (t: Ticker): void => {
    const dt = t.deltaMS
    updaters = updaters.filter((u) => u(dt))
  }
  ticker.add(tick)
  return {
    // Acima do teto, o efeito não entra na lista viva: é avançado até o fim de uma vez
    // (o que já destrói o que ele criou via `done`) em vez de renderizar indefinidamente.
    add: (u) => {
      if (updaters.length >= MAX_ACTIVE_EFFECTS) { u(Number.MAX_SAFE_INTEGER); return }
      updaters = [...updaters, u]
    },
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

/**
 * Avança 8 px na direção (dx, dy) e volta, em 150 ms. Recebe `body` (o sprite/gráfico dentro do
 * `root` da entidade), nunca `root`: o ticker de posição em `app.ts` escreve `root.x/y` a cada
 * frame para seguir o tween, e sobrescreveria qualquer deslocamento aplicado ali.
 */
export const lunge = (body: Container, dx: number, dy: number): Updater => {
  const x0 = body.x
  const y0 = body.y
  return over(150, (k) => {
    const a = Math.sin(k * Math.PI) * 8
    body.x = x0 + dx * a
    body.y = y0 + dy * a
  }, () => { body.x = x0; body.y = y0 })
}

export const shake = (body: Container, px = 2, ms = 120): Updater => {
  const x0 = body.x
  return over(ms, (k) => {
    body.x = k < 1 ? x0 + (Math.round(k * 6) % 2 === 0 ? px : -px) : x0
  }, () => { body.x = x0 })
}

// Contagem de flashes sobrepostos por body: o filtro só some quando o último termina (nunca
// fica preso caso um segundo flash comece antes do primeiro acabar).
const flashCount = new WeakMap<Container, number>()
const flashFilterOf = new WeakMap<Container, ColorMatrixFilter>()

/**
 * Clareia o `body` por `ms` usando `ColorMatrixFilter.brightness` (no Pixi 8, `tint = 0xffffff`
 * é "sem tint" e não produz efeito visual nenhum).
 */
export function flash(body: Container, ms = 100): Updater {
  let filter = flashFilterOf.get(body)
  if (!filter) {
    filter = new ColorMatrixFilter()
    flashFilterOf.set(body, filter)
  }
  filter.brightness(2, false)
  flashCount.set(body, (flashCount.get(body) ?? 0) + 1)
  body.filters = [filter]
  return over(ms, () => {}, () => {
    const remaining = (flashCount.get(body) ?? 1) - 1
    if (remaining <= 0) {
      flashCount.delete(body)
      flashFilterOf.delete(body)
      body.filters = []
    } else {
      flashCount.set(body, remaining)
    }
  })
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
