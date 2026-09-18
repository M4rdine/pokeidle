import type { TerrainInput } from './atlas.js'
import type { RgbaImage } from './compose.js'

const SIZE = 32
const HALF = SIZE / 2
const BYTES_PER_RGBA = 4
const DEFAULT_SOFTNESS = 5
const JITTER_PROBABILITY = 0.35
const SEED_SALT_PRIME = 7919

/** Ordem dos cantos, igual à do Tiled num conjunto "corner". */
const CORNER_ORDER = ['topRight', 'bottomRight', 'bottomLeft', 'topLeft'] as const
type Corner = (typeof CORNER_ORDER)[number]

export const CORNER_CODES: readonly string[] = Array.from({ length: 16 }, (_unused, i) =>
  CORNER_ORDER.map((_c, bit) => ((i >> bit) & 1 ? 'b' : 'a')).join(''))

/** Quadrante do outro lado da borda vertical (mesma metade superior/inferior). */
const VERTICAL_NEIGHBOR: Record<Corner, Corner> = {
  topRight: 'topLeft',
  topLeft: 'topRight',
  bottomRight: 'bottomLeft',
  bottomLeft: 'bottomRight',
}

/** Quadrante do outro lado da borda horizontal (mesma metade esquerda/direita). */
const HORIZONTAL_NEIGHBOR: Record<Corner, Corner> = {
  topRight: 'bottomRight',
  bottomRight: 'topRight',
  topLeft: 'bottomLeft',
  bottomLeft: 'topLeft',
}

/** PRNG determinístico (xorshift de 32 bits): mesma semente, mesmo ruído. */
function noise(seed: number): () => number {
  let state = (seed | 0) || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 1000) / 1000
  }
}

const cornerOf = (x: number, y: number): Corner =>
  y < HALF ? (x < HALF ? 'topLeft' : 'topRight') : x < HALF ? 'bottomLeft' : 'bottomRight'

/** Distância até a linha divisória mais próxima ao longo de um eixo (0 bem na linha). */
function distanceToDivider(coord: number): number {
  return coord < HALF ? HALF - 1 - coord : coord - HALF
}

/**
 * Máscara do tile de cima: 255 onde o material `b` aparece. A borda entre dois quadrantes
 * vizinhos ganha ruído determinístico, para o recorte não virar uma diagonal perfeita — mas o
 * ruído só pode inverter um pixel quando o quadrante do outro lado dessa borda específica tem
 * material diferente. Quando os dois lados são iguais (por exemplo, os dois quadrantes de baixo
 * em "baaa"), inverter criaria sujeira solta no meio de uma área sólida, então o ruído fica desligado ali.
 */
export function transitionMask(code: string, seed: number, softness = DEFAULT_SOFTNESS): Uint8Array {
  const isB = Object.fromEntries(CORNER_ORDER.map((corner, i) => [corner, code[i] === 'b'])) as Record<Corner, boolean>
  const rand = noise(seed + code.length * SEED_SALT_PRIME + code.charCodeAt(0))
  const mask = new Uint8Array(SIZE * SIZE)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const here = cornerOf(x, y)
      const value = isB[here]
      const dx = distanceToDivider(x)
      const dy = distanceToDivider(y)
      const nearVerticalEdge = dx < softness && isB[VERTICAL_NEIGHBOR[here]] !== value
      const nearHorizontalEdge = dy < softness && isB[HORIZONTAL_NEIGHBOR[here]] !== value
      const canJitter = nearVerticalEdge || nearHorizontalEdge
      const flip = canJitter && rand() < JITTER_PROBABILITY
      mask[y * SIZE + x] = (flip ? !value : value) ? 255 : 0
    }
  }
  return mask
}

/** Desenha `over` sobre `base` onde a máscara manda; devolve imagem nova, sem tocar nas entradas. */
export function composeTransition(base: RgbaImage, over: RgbaImage, mask: Uint8Array): RgbaImage {
  if (base.width !== over.width || base.height !== over.height) {
    throw new Error(`composeTransition: tiles de tamanhos diferentes (${base.width}x${base.height} vs ${over.width}x${over.height})`)
  }
  if (mask.length !== base.width * base.height) {
    throw new Error(`composeTransition: máscara com ${mask.length} pixels não bate com o tile ${base.width}x${base.height}`)
  }
  const data = new Uint8Array(base.data)
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 255) continue
    const at = i * BYTES_PER_RGBA
    data.set(over.data.subarray(at, at + BYTES_PER_RGBA), at)
  }
  return { width: base.width, height: base.height, data }
}

export interface TransitionEntry {
  readonly name: string
  readonly from: string
  readonly to: string
  readonly softness?: number | undefined
}

/** As catorze peças mistas; as puras (aaaa/bbbb) reaproveitam os tiles originais. */
export function transitionTiles(entry: TransitionEntry, images: { from: RgbaImage; to: RgbaImage }): { name: string; image: RgbaImage }[] {
  return CORNER_CODES.filter((code) => code !== 'aaaa' && code !== 'bbbb').map((code, i) => ({
    name: `${entry.name}-${code}`,
    image: composeTransition(images.from, images.to, transitionMask(code, i + 1, entry.softness)),
  }))
}

/** Terreno de duas cores apontando cada código de canto para a peça correspondente. */
export function transitionTerrain(entry: TransitionEntry): TerrainInput {
  const colors = [entry.from, entry.to]
  const tileFor = (code: string): string => (code === 'aaaa' ? entry.from : code === 'bbbb' ? entry.to : `${entry.name}-${code}`)
  return {
    name: entry.name,
    colors,
    tiles: CORNER_CODES.map((code) => ({
      tile: tileFor(code),
      corners: [0, 1, 2, 3].map((i) => (code[i] === 'b' ? entry.to : entry.from)) as [string, string, string, string],
    })),
  }
}
