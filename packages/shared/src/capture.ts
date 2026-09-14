import type { Rng } from './rng.js'

const CAPTURE_DIVISOR = 255

export interface CaptureInput {
  readonly captureRate: number
  readonly hpMax: number
  readonly hpCurrent: number
  readonly ballBonus: number
}

export function captureChance({ captureRate, hpMax, hpCurrent, ballBonus }: CaptureInput): number {
  if (hpMax < 1) throw new RangeError(`hpMax inválido: ${hpMax}`)
  if (hpCurrent < 0 || hpCurrent > hpMax) throw new RangeError(`hpCurrent ${hpCurrent} fora de [0, ${hpMax}]`)
  const a = Math.floor(((3 * hpMax - 2 * hpCurrent) * captureRate * ballBonus) / (3 * hpMax))
  return Math.min(1, a / CAPTURE_DIVISOR)
}

export function rollCapture(input: CaptureInput, rng: Rng): boolean {
  return rng.next() < captureChance(input)
}
