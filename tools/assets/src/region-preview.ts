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
 * Reduz cada bloco à sua cor MAIS FREQUENTE, não à média.
 *
 * A média parecia a escolha segura e era a errada por dois motivos, os dois medidos. Primeiro, ela
 * INVENTA cor: a arte tem 722 cores e o mapa reduzido saía com 5.358, porque toda mistura de
 * grama com terra vira um tom que não existe em lugar nenhum do atlas. Isso inchava o PNG de
 * 150 KB para 798 KB — o arquivo que estava em produção. Segundo, misturar borra: árvore e Centro
 * Pokémon perdiam o contorno e o mapa virava uma miniatura desfocada em vez de arte de pixel.
 *
 * A moda resolve os dois de uma vez, porque ela só devolve cor que já estava lá.
 */
export function downsample(img: RgbaImage, fator: number): RgbaImage {
  if (fator < 1 || !Number.isInteger(fator)) throw new RangeError(`fator inválido: ${fator}`)
  if (img.width % fator !== 0 || img.height % fator !== 0) {
    throw new Error(`imagem de ${img.width}x${img.height} não é divisível por ${fator}; a sobra viraria borda suja`)
  }
  const width = img.width / fator
  const height = img.height / fator
  const alvo: RgbaImage = { width, height, data: new Uint8Array(width * height * BYTES) }
  const contagem = new Map<number, number>()

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      contagem.clear()
      let vencedora = 0
      let melhor = 0
      for (let dy = 0; dy < fator; dy++) {
        for (let dx = 0; dx < fator; dx++) {
          const i = ((y * fator + dy) * img.width + x * fator + dx) * BYTES
          // A cor inteira numa chave só: empacotar evita alocar por pixel num laço que roda
          // milhões de vezes. `>>> 0` porque o deslocamento de 24 bits estoura para negativo.
          const chave = (((img.data[i]! << 24) | (img.data[i + 1]! << 16) | (img.data[i + 2]! << 8) | img.data[i + 3]!) >>> 0)
          const n = (contagem.get(chave) ?? 0) + 1
          contagem.set(chave, n)
          // Empate fica com a primeira que chegou: a varredura é determinística, então o mapa
          // gerado duas vezes é byte a byte o mesmo.
          if (n > melhor) { melhor = n; vencedora = chave }
        }
      }
      const d = (y * width + x) * BYTES
      alvo.data[d] = (vencedora >>> 24) & 255
      alvo.data[d + 1] = (vencedora >>> 16) & 255
      alvo.data[d + 2] = (vencedora >>> 8) & 255
      alvo.data[d + 3] = vencedora & 255
    }
  }
  return alvo
}
