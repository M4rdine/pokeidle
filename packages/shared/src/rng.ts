export interface Rng {
  readonly next: () => number
  readonly int: (min: number, max: number) => number
}

/** mulberry32: PRNG de 32 bits, rápido e reprodutível. O estado é o único mutável do pacote. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (min: number, max: number): number => {
    if (min > max) throw new RangeError(`int: min ${min} > max ${max}`)
    return min + Math.floor(next() * (max - min + 1))
  }
  return { next, int }
}
