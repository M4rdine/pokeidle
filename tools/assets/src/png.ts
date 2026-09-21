/**
 * Leitura e escrita de PNG.
 *
 * A LEITURA é do `pngjs`, que faz bem. A ESCRITA é nossa, e a razão é medida: o `pngjs` gravava
 * o atlas de tiles em 864 KB, o de Pokémon em 1.228 KB e o mapa de Kanto em 737 KB; os mesmos
 * pixels, com `zlib.deflateSync` em nível 9 e o filtro escolhido por tentativa, dão 367 KB,
 * 390 KB e 74 KB. São 2,65 MB a menos que o navegador baixa antes de o jogo começar, e o
 * gargalo era inteiramente o deflate da biblioteca — nenhuma opção dela chega perto (o melhor
 * que consegue no mapa é 671 KB contra os nossos 74 KB).
 *
 * Nada aqui é esperto: é a especificação do PNG escrita direto, com um laço a mais para escolher
 * o filtro. O ganho vem de usar o `zlib` do Node em vez do deflate embutido na dependência.
 */
import { deflateSync } from 'node:zlib'
import { PNG } from 'pngjs'
import type { RgbaImage } from './compose.js'

const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
/** RGBA de 8 bits: quatro bytes por pixel. */
const BYTES = 4
const TIPO_RGBA = 6
const PROFUNDIDADE = 8
/** Os cinco filtros por linha que a especificação define: None, Sub, Up, Average e Paeth. */
const FILTROS = [0, 1, 2, 3, 4] as const

const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) c = TABELA_CRC[(c ^ b) & 255]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function bloco(tipo: string, dados: Buffer): Buffer {
  const tamanho = Buffer.alloc(4)
  tamanho.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([tamanho, corpo, crc])
}

/** O preditor de Paeth da especificação: escolhe entre esquerda, acima e diagonal. */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  return pb <= pc ? b : c
}

/** Aplica um filtro à imagem inteira e devolve as linhas prontas para o deflate. */
function filtrar(img: RgbaImage, filtro: number): Buffer {
  const largura = img.width * BYTES
  const passo = largura + 1
  const cru = Buffer.alloc(passo * img.height)

  for (let y = 0; y < img.height; y++) {
    const linha = y * passo
    cru[linha] = filtro
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x
      const v = img.data[i]!
      // Fora da imagem vale zero, como a especificação manda.
      const a = x >= BYTES ? img.data[i - BYTES]! : 0
      const b = y > 0 ? img.data[i - largura]! : 0
      const c = x >= BYTES && y > 0 ? img.data[i - largura - BYTES]! : 0
      const bruto = filtro === 0 ? v
        : filtro === 1 ? v - a
        : filtro === 2 ? v - b
        : filtro === 3 ? v - ((a + b) >> 1)
        : v - paeth(a, b, c)
      cru[linha + 1 + x] = bruto & 255
    }
  }
  return cru
}

/**
 * Grava a imagem, escolhendo o filtro que comprime melhor NESTA imagem.
 *
 * A escolha é por tentativa e não por heurística: são cinco deflates a mais num passo de build,
 * e em troca não há palpite. Na nossa arte o vencedor é sempre o filtro None — diferença entre
 * vizinhos não ajuda quando a cor se repete chapada —, mas cravar isso seria uma suposição sobre
 * arte que ainda não existe.
 */
export function encodePng(img: RgbaImage): Buffer {
  const esperado = img.width * img.height * BYTES
  if (img.data.length !== esperado) {
    throw new Error(`imagem de ${img.width}x${img.height} devia ter ${esperado} bytes e tem ${img.data.length}`)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(img.width, 0)
  ihdr.writeUInt32BE(img.height, 4)
  ihdr.writeUInt8(PROFUNDIDADE, 8)
  ihdr.writeUInt8(TIPO_RGBA, 9)
  // Compressão 0, filtro 0 e entrelaçamento 0: os únicos valores que a especificação define.
  ihdr.writeUInt8(0, 10); ihdr.writeUInt8(0, 11); ihdr.writeUInt8(0, 12)

  let menor: Buffer | null = null
  for (const filtro of FILTROS) {
    const comprimido = deflateSync(filtrar(img, filtro), { level: 9 })
    if (menor === null || comprimido.length < menor.length) menor = comprimido
  }

  return Buffer.concat([
    ASSINATURA,
    bloco('IHDR', ihdr),
    bloco('IDAT', menor!),
    bloco('IEND', Buffer.alloc(0)),
  ])
}

export function decodePng(buf: Uint8Array): RgbaImage {
  const png = PNG.sync.read(Buffer.from(buf))
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) }
}
