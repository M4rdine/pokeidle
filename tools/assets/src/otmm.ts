/**
 * O minimapa do OTClient (`.otmm`): o mundo inteiro do servidor, um byte de cor por tile.
 *
 * É o arquivo de onde sai o mapa-múndi das telas de PokeTibia — a imagem grande com o litoral, as
 * cidades e as estradas. O cliente grava o que o jogador já explorou; um arquivo "completo" é o de
 * quem andou o mundo todo.
 *
 * O FORMATO, lido do `saveOtmm` do OTClient:
 *
 *   cabeçalho   u32 assinatura · u16 início dos dados · u16 versão · u32 bandeiras
 *   versão 1    uma string de descrição (u16 de tamanho + bytes)
 *   por bloco   u16 x · u16 y · u8 z · u16 tamanho comprimido · zlib
 *   fim         uma posição inválida (x, y, z zerados)
 *
 * Cada bloco descomprimido tem 64×64 tiles de 3 bytes — `flags`, `color`, `speed` —, empacotados
 * sem alinhamento. São 12.288 bytes por bloco.
 *
 * A COR É ÍNDICE, não RGB. O Tibia usa um cubo de 6×6×6 (216 cores) e grava o índice; a conversão
 * está em `corDe8Bits`. Fora do cubo, o tile é "não explorado" e fica transparente — é o que
 * desenha o contorno do mundo sem precisar de máscara nenhuma.
 */
import { inflateSync } from 'node:zlib'
import { BinaryReader } from './binary-reader.js'

/** Lado de um bloco, em tiles. Do `MMBLOCK_SIZE` do OTClient. */
export const LADO_DO_BLOCO = 64
const BYTES_POR_TILE = 3
const BYTES_POR_BLOCO = LADO_DO_BLOCO * LADO_DO_BLOCO * BYTES_POR_TILE
/** O cubo de cores do Tibia: 6 níveis por canal. Índices a partir daqui não são cor. */
const CORES = 216
const NIVEIS = 6
const PASSO = 51

export interface BlocoDoMinimapa {
  readonly x: number
  readonly y: number
  readonly z: number
  /** Um byte de cor por tile, na ordem de leitura do bloco (64 linhas de 64). */
  readonly cores: Uint8Array
}

export interface Minimapa {
  readonly versao: number
  readonly descricao: string
  readonly blocos: readonly BlocoDoMinimapa[]
}

/**
 * O índice da paleta do Tibia em RGB, ou `null` quando não é cor.
 *
 * `0` é o vazio e qualquer índice acima do cubo também: os dois significam "este tile nunca foi
 * visto", e pintá-los de preto encheria o mundo de um oceano que não existe.
 */
export function corDe8Bits(indice: number): readonly [number, number, number] | null {
  if (indice <= 0 || indice >= CORES) return null
  return [
    Math.floor(indice / (NIVEIS * NIVEIS)) % NIVEIS * PASSO,
    Math.floor(indice / NIVEIS) % NIVEIS * PASSO,
    indice % NIVEIS * PASSO,
  ]
}

/** Lê uma string do OTClient: u16 de tamanho, depois os bytes. */
function lerTexto(r: BinaryReader): string {
  return new TextDecoder().decode(r.bytes(r.u16()))
}

export function lerMinimapa(dados: Uint8Array): Minimapa {
  const r = BinaryReader.fromBuffer(dados)
  r.u32() // assinatura: o OTClient não a confere contra um valor fixo ao carregar
  r.u16() // início dos dados, reescrito na gravação
  const versao = r.u16()
  r.u32() // bandeiras
  const descricao = versao === 1 ? lerTexto(r) : ''

  const blocos: BlocoDoMinimapa[] = []
  for (;;) {
    const x = r.u16()
    const y = r.u16()
    const z = r.u8()
    // O fim é uma posição inválida. Sem esta saída, o laço leria o lixo depois do último bloco.
    if (x === 0 && y === 0 && z === 0) break
    const comprimido = r.bytes(r.u16())
    const cru = inflateSync(comprimido)
    if (cru.length < BYTES_POR_BLOCO) {
      throw new Error(`bloco (${x},${y},${z}) tem ${cru.length} bytes, esperado ${BYTES_POR_BLOCO}`)
    }
    // Só a cor interessa: `flags` diz se o tile foi visto e `speed` é o custo de andar, e nenhum
    // dos dois desenha nada.
    const cores = new Uint8Array(LADO_DO_BLOCO * LADO_DO_BLOCO)
    for (let i = 0; i < cores.length; i++) cores[i] = cru[i * BYTES_POR_TILE + 1]!
    blocos.push({ x, y, z, cores })
  }
  return { versao, descricao, blocos }
}

export interface ImagemRgba { readonly width: number; readonly height: number; readonly data: Uint8Array }

/**
 * Pinta um andar inteiro numa imagem, recortada nos limites do que existe.
 *
 * O mundo do Tibia tem coordenadas na casa dos 30 mil, e uma imagem dessa largura seria quase toda
 * transparente: a moldura é calculada a partir dos blocos que o arquivo traz, e devolvida junto,
 * porque sem ela não há como saber a que parte do mundo a imagem corresponde.
 */
export function pintarAndar(mapa: Minimapa, z: number): { imagem: ImagemRgba; x: number; y: number } | null {
  const doAndar = mapa.blocos.filter((b) => b.z === z)
  if (doAndar.length === 0) return null
  const x0 = Math.min(...doAndar.map((b) => b.x))
  const y0 = Math.min(...doAndar.map((b) => b.y))
  const largura = Math.max(...doAndar.map((b) => b.x)) + LADO_DO_BLOCO - x0
  const altura = Math.max(...doAndar.map((b) => b.y)) + LADO_DO_BLOCO - y0
  const data = new Uint8Array(largura * altura * 4)
  for (const bloco of doAndar) {
    for (let i = 0; i < bloco.cores.length; i++) {
      const cor = corDe8Bits(bloco.cores[i]!)
      if (!cor) continue
      const px = bloco.x - x0 + (i % LADO_DO_BLOCO)
      const py = bloco.y - y0 + Math.floor(i / LADO_DO_BLOCO)
      const p = (py * largura + px) * 4
      data[p] = cor[0]; data[p + 1] = cor[1]; data[p + 2] = cor[2]; data[p + 3] = 255
    }
  }
  return { imagem: { width: largura, height: altura, data }, x: x0, y: y0 }
}
