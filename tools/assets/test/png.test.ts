/**
 * O escritor de PNG é nosso, byte a byte, porque o do `pngjs` comprimia mal — 864 KB onde os
 * mesmos pixels cabem em 367 KB. Código que emite formato binário à mão erra em silêncio: o
 * arquivo abre e o que está dentro não é o que se quis gravar. Por isso todo teste aqui fecha o
 * ciclo — grava e LÊ DE VOLTA com o decodificador, comparando pixel a pixel.
 */
import { describe, expect, it } from 'vitest'
import { decodePng, encodePng } from '../src/png.js'
import type { RgbaImage } from '../src/compose.js'

function imagem(width: number, height: number, pixel: (x: number, y: number) => readonly [number, number, number, number]): RgbaImage {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4)
  }
  return { width, height, data }
}

const OPACO = 255

describe('escrita de PNG', () => {
  it('o que sai é pixel a pixel o que entrou', () => {
    const img = imagem(13, 7, (x, y) => [x * 17 % 256, y * 31 % 256, (x + y) * 7 % 256, OPACO])
    const lido = decodePng(encodePng(img))
    expect([lido.width, lido.height]).toEqual([13, 7])
    expect([...lido.data]).toEqual([...img.data])
  })

  it('guarda a transparência, inclusive parcial', () => {
    // O sprite recortado do atlas é quase todo transparente: se o alfa se perdesse, cada Pokémon
    // sairia dentro de um retângulo opaco e ninguém notaria no código, só na tela.
    const img = imagem(8, 8, (x, y) => [10, 20, 30, (x + y) % 2 === 0 ? 0 : (x * 32) % 256])
    expect([...decodePng(encodePng(img)).data]).toEqual([...img.data])
  })

  it('uma imagem de um pixel é um PNG válido', () => {
    const img = imagem(1, 1, () => [1, 2, 3, 4])
    expect([...decodePng(encodePng(img)).data]).toEqual([1, 2, 3, 4])
  })

  it('imagem larga e de uma linha só, onde o filtro não tem linha anterior', () => {
    const img = imagem(64, 1, (x) => [x * 4 % 256, 0, 255 - x, OPACO])
    expect([...decodePng(encodePng(img)).data]).toEqual([...img.data])
  })

  it('é determinístico: o mesmo desenho grava os mesmos bytes', () => {
    // Sem isto, regerar o atlas sujaria o diff do git a cada build mesmo sem mudança nenhuma.
    const img = imagem(20, 12, (x, y) => [x, y, x ^ y, OPACO])
    expect(encodePng(img).equals(encodePng(img))).toBe(true)
  })

  it('recusa imagem cujo tamanho não bate com os dados', () => {
    // O erro típico de quem monta `RgbaImage` à mão. Melhor estourar aqui do que gravar um PNG
    // truncado que só falha na hora de desenhar.
    const quebrada: RgbaImage = { width: 4, height: 4, data: new Uint8Array(10) }
    expect(() => encodePng(quebrada)).toThrow(/devia ter 64 bytes/)
  })

  it('arte chapada comprime muito melhor que o pior caso', () => {
    // É a razão de o escritor existir. Uma superfície de cor sólida tem que virar quase nada;
    // se um dia voltar a pesar como RGBA cru, alguma coisa quebrou no deflate.
    const chapada = imagem(256, 256, () => [40, 90, 60, OPACO])
    expect(encodePng(chapada).length).toBeLessThan(chapada.data.length / 50)
  })
})
