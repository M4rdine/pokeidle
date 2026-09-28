/**
 * O leitor do minimapa do OTClient.
 *
 * O arquivo real é o mundo de um servidor de terceiro e não vive no repositório — então a prova é
 * um `.otmm` SINTÉTICO, montado aqui byte a byte segundo o `saveOtmm` do OTClient. Isso testa o
 * que de fato pode quebrar (a ordem dos campos, a saída do laço, o desempacotamento de 3 bytes por
 * tile) sem depender de baixar nada.
 */
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { corDe8Bits, lerMinimapa, pintarAndar, LADO_DO_BLOCO } from '../src/otmm.js'

const TILES = LADO_DO_BLOCO * LADO_DO_BLOCO

/** Um bloco cru: 3 bytes por tile, e a cor no do meio. */
function bloco(pintar: (i: number) => number): Buffer {
  const b = Buffer.alloc(TILES * 3)
  for (let i = 0; i < TILES; i++) { b[i * 3] = 1; b[i * 3 + 1] = pintar(i); b[i * 3 + 2] = 100 }
  return b
}

/** Um `.otmm` inteiro, na ordem exata em que o OTClient grava. */
function arquivo(blocos: readonly { x: number; y: number; z: number; cru: Buffer }[]): Uint8Array {
  const cabeca = Buffer.alloc(12)
  cabeca.writeUInt32LE(0x004d4d54, 0)
  cabeca.writeUInt16LE(0, 4)
  cabeca.writeUInt16LE(1, 6)
  cabeca.writeUInt32LE(0, 8)
  const texto = Buffer.from('OTMM 1.0')
  const desc = Buffer.alloc(2 + texto.length)
  desc.writeUInt16LE(texto.length, 0)
  texto.copy(desc, 2)
  const corpos = blocos.map((b) => {
    const z = deflateSync(b.cru)
    const cab = Buffer.alloc(7)
    cab.writeUInt16LE(b.x, 0); cab.writeUInt16LE(b.y, 2); cab.writeUInt8(b.z, 4); cab.writeUInt16LE(z.length, 5)
    return Buffer.concat([cab, z])
  })
  // O fim é uma posição inválida: x, y e z zerados.
  return Buffer.concat([cabeca, desc, ...corpos, Buffer.alloc(5)])
}

describe('a cor de 8 bits do Tibia', () => {
  it('é um cubo de 6×6×6, em passos de 51', () => {
    expect(corDe8Bits(1)).toEqual([0, 0, 51])
    expect(corDe8Bits(6)).toEqual([0, 51, 0])
    expect(corDe8Bits(36)).toEqual([51, 0, 0])
    expect(corDe8Bits(215)).toEqual([255, 255, 255])
  })

  it('fora do cubo NÃO é cor: é tile nunca visto', () => {
    // Pintar isto de preto encheria o mundo de um oceano que não existe — e é justamente o vazio
    // que desenha o contorno do continente.
    expect(corDe8Bits(0)).toBeNull()
    expect(corDe8Bits(216)).toBeNull()
    expect(corDe8Bits(255)).toBeNull()
  })
})

describe('ler o minimapa', () => {
  it('lê o cabeçalho, a descrição e os blocos', () => {
    const m = lerMinimapa(arquivo([{ x: 128, y: 256, z: 7, cru: bloco(() => 6) }]))
    expect(m.versao).toBe(1)
    expect(m.descricao).toBe('OTMM 1.0')
    expect(m.blocos).toHaveLength(1)
    expect(m.blocos[0]).toMatchObject({ x: 128, y: 256, z: 7 })
    expect(m.blocos[0]!.cores).toHaveLength(TILES)
    expect(m.blocos[0]!.cores[0]).toBe(6)
  })

  it('para na posição inválida: sem isso, leria o lixo depois do último bloco', () => {
    const m = lerMinimapa(arquivo([
      { x: 64, y: 64, z: 7, cru: bloco(() => 1) },
      { x: 128, y: 64, z: 7, cru: bloco(() => 2) },
    ]))
    expect(m.blocos).toHaveLength(2)
  })

  it('pega a COR, que é o byte do meio — não a bandeira nem a velocidade', () => {
    // Trocar a ordem aqui pintaria o mundo com o custo de andar, e o erro passaria como "as cores
    // ficaram estranhas" em vez de falhar.
    const m = lerMinimapa(arquivo([{ x: 64, y: 64, z: 7, cru: bloco((i) => (i % 200) + 1) }]))
    expect([...m.blocos[0]!.cores.slice(0, 4)]).toEqual([1, 2, 3, 4])
  })

  it('bloco truncado é erro, e não uma imagem meio pintada', () => {
    const curto = Buffer.alloc(10)
    expect(() => lerMinimapa(arquivo([{ x: 64, y: 64, z: 7, cru: curto }]))).toThrow(/esperado/)
  })
})

describe('pintar um andar', () => {
  it('recorta nos limites do que existe, e devolve onde o recorte começa', () => {
    /*
     * O mundo do Tibia tem coordenadas na casa dos 30 mil. Uma imagem dessa largura seria quase
     * toda transparente — e sem a origem não há como saber a que parte do mundo ela corresponde.
     */
    const m = lerMinimapa(arquivo([
      { x: 1024, y: 2048, z: 7, cru: bloco(() => 6) },
      { x: 1088, y: 2048, z: 7, cru: bloco(() => 6) },
    ]))
    const r = pintarAndar(m, 7)!
    expect(r.x).toBe(1024)
    expect(r.y).toBe(2048)
    expect(r.imagem.width).toBe(LADO_DO_BLOCO * 2)
    expect(r.imagem.height).toBe(LADO_DO_BLOCO)
  })

  it('o tile não visto fica TRANSPARENTE, e é ele que desenha o contorno', () => {
    const m = lerMinimapa(arquivo([{ x: 64, y: 64, z: 7, cru: bloco((i) => (i === 0 ? 6 : 0)) }]))
    const { imagem } = pintarAndar(m, 7)!
    expect(imagem.data[3]).toBe(255)
    expect(imagem.data[7]).toBe(0)
  })

  it('andar sem bloco nenhum devolve nulo, e não uma imagem de tamanho zero', () => {
    const m = lerMinimapa(arquivo([{ x: 64, y: 64, z: 7, cru: bloco(() => 6) }]))
    expect(pintarAndar(m, 6)).toBeNull()
  })
})
