/**
 * O gerador entrega o objeto sobre fundo chapado, não sobre transparência. Recortar à mão não
 * escala, então o fundo sai por preenchimento a partir da borda: assim um buraco interno da
 * mesma cor do fundo — céu aparecendo no meio da copa — continua opaco, que é o que um recorte
 * por cor global erraria.
 */
import type { RgbaImage } from './compose.js'

const BYTES = 4
type Rgb = readonly [number, number, number]

const at = (img: RgbaImage, x: number, y: number): Rgb => {
  const i = (y * img.width + x) * BYTES
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!]
}

const dist2 = (a: Rgb, b: Rgb): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

/** A cor de fundo é a mais repetida entre os quatro cantos. */
function backgroundColor(img: RgbaImage): Rgb {
  const cantos: Rgb[] = [
    at(img, 0, 0),
    at(img, img.width - 1, 0),
    at(img, 0, img.height - 1),
    at(img, img.width - 1, img.height - 1),
  ]
  let melhor = cantos[0]!
  let maior = 0
  for (const c of cantos) {
    const n = cantos.filter((o) => dist2(o, c) < 100).length
    if (n > maior) { maior = n; melhor = c }
  }
  return melhor
}

export function removeFlatBackground(img: RgbaImage, tolerance = 12): RgbaImage {
  const data = new Uint8Array(img.data)
  const fundo = backgroundColor(img)
  const limite = tolerance * tolerance * 3
  const visto = new Uint8Array(img.width * img.height)
  const fila: number[] = []

  const talvez = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return
    const idx = y * img.width + x
    if (visto[idx] === 1) return
    if (dist2(at(img, x, y), fundo) > limite) return
    visto[idx] = 1
    fila.push(idx)
  }

  for (let x = 0; x < img.width; x++) { talvez(x, 0); talvez(x, img.height - 1) }
  for (let y = 0; y < img.height; y++) { talvez(0, y); talvez(img.width - 1, y) }

  let head = 0
  while (head < fila.length) {
    const idx = fila[head++]!
    const x = idx % img.width
    const y = Math.floor(idx / img.width)
    talvez(x + 1, y); talvez(x - 1, y); talvez(x, y + 1); talvez(x, y - 1)
  }

  // Se o preenchimento tomou quase tudo, a imagem não tinha fundo: os cantos eram o próprio
  // objeto. Apagar aqui devolveria uma peça vazia, que é pior que não recortar.
  const QUASE_TUDO = 0.95
  if (fila.length >= img.width * img.height * QUASE_TUDO) {
    return { width: img.width, height: img.height, data }
  }
  for (const idx of fila) data[idx * BYTES + 3] = 0
  return { width: img.width, height: img.height, data }
}

/** Apara a borda transparente e centraliza o conteúdo numa célula quadrada do tamanho pedido. */
export function trimTransparent(img: RgbaImage, size: number): RgbaImage {
  let minX = img.width
  let minY = img.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * BYTES + 3]! === 0) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  const data = new Uint8Array(size * size * BYTES)
  if (maxX < 0) return { width: size, height: size, data }

  const w = Math.min(maxX - minX + 1, size)
  const h = Math.min(maxY - minY + 1, size)
  const ox = Math.floor((size - w) / 2)
  const oy = Math.floor((size - h) / 2)
  for (let y = 0; y < h; y++) {
    const from = ((minY + y) * img.width + minX) * BYTES
    data.set(img.data.subarray(from, from + w * BYTES), ((oy + y) * size + ox) * BYTES)
  }
  return { width: size, height: size, data }
}
