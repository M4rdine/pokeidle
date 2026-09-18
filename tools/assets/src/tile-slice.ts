import type { RgbaImage } from './compose.js'

const BYTES_PER_RGBA = 4

/** Nome de uma peça de item grande: `pokecenter` 2×2 vira `pokecenter-x0-y0` … `pokecenter-x1-y1`. */
export const sliceName = (base: string, col: number, row: number): string => `${base}-x${col}-y${row}`

/** Corta a imagem em `cols × rows` peças iguais, na ordem de leitura. */
export function sliceImage(image: RgbaImage, cols: number, rows: number): RgbaImage[] {
  if (cols === 1 && rows === 1) return [image]
  if (image.width % cols !== 0 || image.height % rows !== 0) {
    throw new Error(`corte ${cols}x${rows} não divide a imagem ${image.width}x${image.height}`)
  }
  const pieceW = image.width / cols
  const pieceH = image.height / rows
  const pieces: RgbaImage[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const data = new Uint8Array(pieceW * pieceH * BYTES_PER_RGBA)
      for (let y = 0; y < pieceH; y++) {
        const from = ((row * pieceH + y) * image.width + col * pieceW) * BYTES_PER_RGBA
        data.set(image.data.subarray(from, from + pieceW * BYTES_PER_RGBA), y * pieceW * BYTES_PER_RGBA)
      }
      pieces.push({ width: pieceW, height: pieceH, data })
    }
  }
  return pieces
}
