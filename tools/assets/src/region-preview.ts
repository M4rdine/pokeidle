/**
 * O mapa-múndi de uma região, montado a partir das áreas já importadas.
 *
 * Compor as oito áreas nos seus `bounds` reusa o renderizador de prévia que já é testado, em vez
 * de reimplementar a conversão de gid para nome de tile só para desenhar o mesmo pixel.
 */
import type { RgbaImage } from './compose.js'

const BYTES = 4

export interface Retangulo {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface PedacoDaRegiao {
  readonly imagem: RgbaImage
  /** Onde a área fica dentro da região, em tiles. */
  readonly bounds: Retangulo
}

export interface GradeDaRegiao {
  readonly width: number
  readonly height: number
  readonly tileSize: number
}

/** Cola cada área no lugar dela e devolve a região inteira, em pixels. */
export function composeRegion(grade: GradeDaRegiao, pedacos: readonly PedacoDaRegiao[]): RgbaImage {
  const width = grade.width * grade.tileSize
  const height = grade.height * grade.tileSize
  const alvo: RgbaImage = { width, height, data: new Uint8Array(width * height * BYTES) }

  for (const { imagem, bounds } of pedacos) {
    const ox = bounds.x * grade.tileSize
    const oy = bounds.y * grade.tileSize
    // Recorte silencioso esconderia um erro de `bounds` como se fosse borda do mapa.
    if (ox + imagem.width > width || oy + imagem.height > height) {
      throw new Error(`área em (${bounds.x}, ${bounds.y}) não cabe na região de ${grade.width}x${grade.height} tiles`)
    }
    for (let y = 0; y < imagem.height; y++) {
      const de = y * imagem.width * BYTES
      alvo.data.set(imagem.data.subarray(de, de + imagem.width * BYTES), ((oy + y) * width + ox) * BYTES)
    }
  }
  return alvo
}

/**
 * Reduz por média de bloco. Amostrar um pixel por bloco seria mais rápido e devolveria um mapa
 * cheio de ruído: numa arte de pixel, o vizinho de um tufo de grama é terra.
 */
export function downsample(img: RgbaImage, fator: number): RgbaImage {
  if (fator < 1 || !Number.isInteger(fator)) throw new RangeError(`fator inválido: ${fator}`)
  if (img.width % fator !== 0 || img.height % fator !== 0) {
    throw new Error(`imagem de ${img.width}x${img.height} não é divisível por ${fator}; a sobra viraria borda suja`)
  }
  const width = img.width / fator
  const height = img.height / fator
  const alvo: RgbaImage = { width, height, data: new Uint8Array(width * height * BYTES) }
  const area = fator * fator

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const soma = [0, 0, 0, 0]
      for (let dy = 0; dy < fator; dy++) {
        for (let dx = 0; dx < fator; dx++) {
          const i = ((y * fator + dy) * img.width + x * fator + dx) * BYTES
          for (let c = 0; c < BYTES; c++) soma[c] = (soma[c] ?? 0) + (img.data[i + c] ?? 0)
        }
      }
      const d = (y * width + x) * BYTES
      for (let c = 0; c < BYTES; c++) alvo.data[d + c] = Math.round((soma[c] ?? 0) / area)
    }
  }
  return alvo
}
