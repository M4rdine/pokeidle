import { ColorMatrixFilter, Container, Graphics, Text, type Ticker } from 'pixi.js'

export type Updater = (dtMs: number) => boolean // devolve false quando termina

const MAX_ACTIVE_EFFECTS = 200
const FLASH_BRIGHTNESS = 2

export interface EffectRunner {
  add(u: Updater): void
  /** Clareia `body` usando o `ColorMatrixFilter` único da cena (ver `destroy`). */
  flash(body: Container, ms?: number): void
  destroy(): void
}

export function createEffectRunner(ticker: Ticker): EffectRunner {
  let updaters: Updater[] = []
  // Um efeito quebrado (ex.: escreveu num Container já destruído por fora) nunca pode travar o
  // loop de render inteiro — descarta só aquele efeito.
  const safeRun = (u: Updater, dt: number): boolean => {
    try {
      return u(dt)
    } catch {
      return false
    }
  }
  const tick = (t: Ticker): void => {
    const dt = t.deltaMS
    updaters = updaters.filter((u) => safeRun(u, dt))
  }
  ticker.add(tick)
  const add = (u: Updater): void => {
    // Acima do teto, o efeito não entra na lista viva: é avançado até o fim de uma vez (o que já
    // destrói o que ele criou via `done`) em vez de renderizar indefinidamente.
    if (updaters.length >= MAX_ACTIVE_EFFECTS) {
      safeRun(u, Number.MAX_SAFE_INTEGER)
      return
    }
    updaters = [...updaters, u]
  }

  // Um único filtro para toda a cena: compartilhar a mesma instância entre bodies é seguro (o
  // ColorMatrixFilter não guarda estado por alvo) e evita criar/destruir um por flash.
  const flashFilter = new ColorMatrixFilter()
  flashFilter.brightness(FLASH_BRIGHTNESS, false)
  const flashCount = new WeakMap<Container, number>()
  const flash = (body: Container, ms = 100): void => {
    flashCount.set(body, (flashCount.get(body) ?? 0) + 1)
    body.filters = [flashFilter]
    add(guardDestroyed(body, over(ms, () => {}, () => {
      const remaining = (flashCount.get(body) ?? 1) - 1
      if (remaining <= 0) {
        flashCount.delete(body)
        body.filters = []
      } else {
        flashCount.set(body, remaining)
      }
    })))
  }

  return {
    add,
    flash,
    destroy: () => { ticker.remove(tick); updaters = []; flashFilter.destroy() },
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
 * `target` pode ser destruído por fora (ex.: troca de espécie no meio de um lunge/shake/flash).
 * No Pixi 8, escrever `x`/`y`/`filters` num Container destruído lança — então, uma vez destruído,
 * o efeito para (devolve `false`) sem tocar em mais nada.
 */
const guardDestroyed = (target: Container, u: Updater): Updater => (dt) => {
  if (target.destroyed) return false
  return u(dt)
}

/**
 * Avança 8 px na direção (dx, dy) e volta, em 150 ms. Recebe `body` (o sprite/gráfico dentro do
 * `root` da entidade), nunca `root`: o ticker de posição em `app.ts` escreve `root.x/y` a cada
 * frame para seguir o tween, e sobrescreveria qualquer deslocamento aplicado ali. O deslocamento
 * é sempre relativo a 0 (nunca a um valor capturado no início): se dois efeitos se sobrepuserem
 * no mesmo body, o último a escrever prevalece a cada frame, e o que terminar por último grava 0
 * — nunca fica deslocado para sempre.
 */
export const lunge = (body: Container, dx: number, dy: number): Updater =>
  guardDestroyed(body, over(150, (k) => {
    const a = Math.sin(k * Math.PI) * 8
    body.x = dx * a
    body.y = dy * a
  }, () => { body.x = 0; body.y = 0 }))

export const shake = (body: Container, px = 2, ms = 120): Updater =>
  guardDestroyed(body, over(ms, (k) => {
    body.x = k < 1 ? (Math.round(k * 6) % 2 === 0 ? px : -px) : 0
  }, () => { body.x = 0 }))

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
