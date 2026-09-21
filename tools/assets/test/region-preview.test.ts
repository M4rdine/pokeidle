import { describe, expect, it } from 'vitest'
import { composeRegion, downsample } from '../src/region-preview.js'
import type { RgbaImage } from '../src/compose.js'

/** Imagem chapada de uma cor, do tamanho pedido. */
const chapada = (w: number, h: number, cor: [number, number, number]): RgbaImage => {
  const data = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = cor[0]; data[i * 4 + 1] = cor[1]; data[i * 4 + 2] = cor[2]; data[i * 4 + 3] = 255
  }
  return { width: w, height: h, data }
}
const pixel = (img: RgbaImage, x: number, y: number): number[] =>
  [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)]

describe('compor a região a partir das áreas', () => {
  it('põe cada área no lugar dela, em pixels, e devolve a região inteira', () => {
    const regiao = composeRegion(
      { width: 4, height: 2, tileSize: 8 },
      [
        { imagem: chapada(16, 16, [255, 0, 0]), bounds: { x: 0, y: 0, width: 2, height: 2 } },
        { imagem: chapada(16, 16, [0, 255, 0]), bounds: { x: 2, y: 0, width: 2, height: 2 } },
      ],
    )
    expect([regiao.width, regiao.height]).toEqual([32, 16])
    expect(pixel(regiao, 0, 0)).toEqual([255, 0, 0])
    // A segunda área começa no tile 2, que é o pixel 16.
    expect(pixel(regiao, 16, 0)).toEqual([0, 255, 0])
    expect(pixel(regiao, 15, 15)).toEqual([255, 0, 0])
  })

  it('área que não cabe na região é erro, e não recorte silencioso', () => {
    expect(() => composeRegion(
      { width: 2, height: 2, tileSize: 8 },
      [{ imagem: chapada(16, 16, [1, 2, 3]), bounds: { x: 1, y: 0, width: 2, height: 2 } }],
    )).toThrow(/não cabe/)
  })
})

describe('reduzir a escala para caber numa tela', () => {
  it('média de cada bloco: dois quadrantes de cores diferentes viram a média deles', () => {
    const img = chapada(4, 4, [0, 0, 0])
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const i = (y * 4 + x) * 4
      img.data[i] = 200; img.data[i + 1] = 200; img.data[i + 2] = 200
    }
    const menor = downsample(img, 2)
    expect([menor.width, menor.height]).toEqual([2, 2])
    // O bloco 2×2 do canto superior esquerdo era todo claro.
    expect(pixel(menor, 0, 0)).toEqual([200, 200, 200])
    expect(pixel(menor, 1, 1)).toEqual([0, 0, 0])
  })

  it('a cor mais frequente vence, e nenhuma cor nova é inventada', () => {
    const img = chapada(2, 2, [0, 0, 0])
    img.data[0] = 100; img.data[1] = 100; img.data[2] = 100
    // Um pixel de 100 e três de 0. A média daria 25 — uma cor que não existe em pixel nenhum do
    // bloco, e é assim que o mapa reduzido saía com 5.358 cores a partir de uma arte de 722.
    expect(pixel(downsample(img, 2), 0, 0)).toEqual([0, 0, 0])
  })

  it('reduzir não aumenta a paleta: toda cor da saída já estava na entrada', () => {
    // É a propriedade que importa, e a que a média violava. Ela é o que deixa o PNG do mapa
    // caber em 150 KB em vez de 798 KB, e o que mantém o contorno das árvores.
    const img = chapada(8, 8, [10, 20, 30])
    const paleta: (readonly [number, number, number])[] = [[10, 20, 30], [200, 40, 60], [0, 120, 90]]
    for (let i = 0; i < 64; i++) {
      const cor = paleta[i % paleta.length]!
      img.data[i * 4] = cor[0]; img.data[i * 4 + 1] = cor[1]; img.data[i * 4 + 2] = cor[2]
    }
    const menor = downsample(img, 2)
    const conhecidas = new Set(paleta.map((c) => c.join(',')))
    for (let y = 0; y < menor.height; y++) {
      for (let x = 0; x < menor.width; x++) {
        expect(conhecidas.has(pixel(menor, x, y).join(',')), `(${x},${y})`).toBe(true)
      }
    }
  })

  it('fator que não divide o tamanho é recusado: sobra de pixel vira borda suja', () => {
    expect(() => downsample(chapada(5, 4, [0, 0, 0]), 2)).toThrow(/divisível/)
  })
})
