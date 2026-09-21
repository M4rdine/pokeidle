/**
 * Recorta e repinta os ícones de controle da interface, da folha do VerzatileDev (CC0).
 *
 * POR QUE POR LUMINÂNCIA, e não por troca exata de cor como nas molduras: a folha de origem é
 * SOMBREADA — um ícone usa oito tons de azul, com meio-tom nas bordas. Uma tabela de-para
 * precisaria das oito entradas e quebraria no primeiro ícone com um tom a mais. Mapear o brilho
 * de cada pixel sobre a nossa rampa preserva o desenho e a sombra, e joga tudo dentro da nossa
 * paleta de uma vez.
 *
 * O QUE ESTE PACK NÃO RESOLVE: ícone de assunto. Não há livro, mapa, mochila, loja nem
 * engrenagem — só controle. Os seis do menu de funções são desenhados à mão, em
 * `ui-icones-menu.ts`, e o porquê está lá.
 *
 * Uso: `pnpm icones` na raiz. As PNGs geradas são versionadas, então o build normal não depende
 * deste passo.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng } from '../src/png.js'
import type { RgbaImage } from '../src/compose.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const FOLHA = join(RAIZ, 'tools', 'assets', 'ui', 'verzatile', 'icones-32.png')
const SAIDA = join(RAIZ, 'packages', 'client', 'src', 'styles', 'ui')

/** A folha é uma grade de 8×8 de 32 px, sem respiro entre as células. */
const LADO = 32
const COLUNAS = 8

/** Extremos da rampa: o escuro é a sombra da madeira, o claro é a tinta do texto. */
const SOMBRA = [0x5d, 0x44, 0x38] as const
const TINTA = [0xf2, 0xe7, 0xd6] as const

/**
 * Os ícones que a interface REALMENTE usa. A folha tem 64; trazer os 64 encheria o repositório
 * de arte que ninguém desenha na tela, e cada um deles seria um convite a inventar um uso.
 */
const ICONES: readonly { readonly nome: string; readonly tile: number; readonly onde: string }[] = [
  { nome: 'mais', tile: 33, onde: 'aproximar o mapa' },
  { nome: 'menos', tile: 34, onde: 'afastar o mapa' },
  { nome: 'parar', tile: 3, onde: 'encerrar a caçada' },
  { nome: 'cadeado', tile: 50, onde: 'área que ainda não abriu' },
  { nome: 'fechar', tile: 35, onde: 'fechar um modal' },
]

/** Recorta um tile da folha pelo índice. */
function recortar(folha: RgbaImage, indice: number): RgbaImage {
  const cx = (indice % COLUNAS) * LADO
  const cy = Math.floor(indice / COLUNAS) * LADO
  const data = new Uint8Array(LADO * LADO * 4)
  for (let y = 0; y < LADO; y++) {
    for (let x = 0; x < LADO; x++) {
      const de = ((cy + y) * folha.width + cx + x) * 4
      data.set(folha.data.subarray(de, de + 4), (y * LADO + x) * 4)
    }
  }
  return { width: LADO, height: LADO, data }
}

/** Luminância perceptual, 0 a 1. É ela que diz onde cada pixel cai na rampa. */
const brilho = (r: number, g: number, b: number): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

/**
 * Estica o contraste antes de mapear. Sem isto a folha, que é toda de azul claro, cairia na
 * metade de cima da rampa e sairia um ícone chapado, sem a sombra que dá forma a ele.
 */
function normalizar(img: RgbaImage): { readonly min: number; readonly vao: number } {
  let min = 1
  let max = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3]! === 0) continue
    const l = brilho(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!)
    if (l < min) min = l
    if (l > max) max = l
  }
  // Ícone de um tom só: sem vão, tudo vai para o claro da rampa em vez de dividir por zero.
  return { min, vao: max - min || 1 }
}

function repintar(img: RgbaImage): RgbaImage {
  const { min, vao } = normalizar(img)
  const data = new Uint8Array(img.data)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! === 0) continue
    const t = Math.min(1, Math.max(0, (brilho(data[i]!, data[i + 1]!, data[i + 2]!) - min) / vao))
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(SOMBRA[c]! + (TINTA[c]! - SOMBRA[c]!) * t)
  }
  return { width: img.width, height: img.height, data }
}

async function main(): Promise<void> {
  const folha = decodePng(await readFile(FOLHA))
  await mkdir(SAIDA, { recursive: true })
  for (const icone of ICONES) {
    const alvo = join(SAIDA, `icone-${icone.nome}.png`)
    await writeFile(alvo, encodePng(repintar(recortar(folha, icone.tile))))
    process.stdout.write(`${icone.nome.padEnd(10)} tile ${String(icone.tile).padStart(2)}  ${icone.onde}\n`)
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`erro: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
