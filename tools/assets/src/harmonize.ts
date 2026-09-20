/**
 * Conjuntos de terreno gerados em sorteios diferentes trazem tons diferentes do mesmo material:
 * quatro conjuntos de campo vieram com quatro verdes. Colados num mapa, a grama muda de cor na
 * emenda. Este módulo puxa cada material para uma cor canônica, com ganho por canal, o que
 * preserva o sombreado relativo em vez de achatar a textura.
 */
import type { RgbaImage } from './compose.js'

export type Rgb = readonly [number, number, number]

export interface MaterialShift {
  /** Cor média medida no conjunto. */
  readonly measured: Rgb
  /** Cor que todos os conjuntos passam a usar para este material. */
  readonly canonical: Rgb
}

const dist2 = (a: Rgb, b: Rgb): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
const clamp = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

/** Ganho por canal, com piso para não dividir por zero num canal apagado. */
function gains(m: MaterialShift): Rgb {
  return [m.canonical[0] / Math.max(m.measured[0], 1), m.canonical[1] / Math.max(m.measured[1], 1), m.canonical[2] / Math.max(m.measured[2], 1)]
}

export function harmonize(img: RgbaImage, materials: readonly MaterialShift[]): RgbaImage {
  const data = new Uint8Array(img.data)
  if (materials.length === 0) return { width: img.width, height: img.height, data }
  const table = materials.map((m) => ({ measured: m.measured, gain: gains(m) }))

  for (let i = 0; i < data.length; i += 4) {
    const pixel: Rgb = [data[i]!, data[i + 1]!, data[i + 2]!]
    let melhor = table[0]!
    let menor = dist2(pixel, melhor.measured)
    for (const t of table.slice(1)) {
      const d = dist2(pixel, t.measured)
      if (d < menor) { menor = d; melhor = t }
    }
    data[i] = clamp(pixel[0] * melhor.gain[0])
    data[i + 1] = clamp(pixel[1] * melhor.gain[1])
    data[i + 2] = clamp(pixel[2] * melhor.gain[2])
  }
  return { width: img.width, height: img.height, data }
}
