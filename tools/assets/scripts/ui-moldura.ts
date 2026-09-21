/**
 * Recorta e repinta as molduras da interface a partir da folha do Kenney (CC0).
 *
 * POR QUE EXISTE: até aqui toda moldura, botão e medidor da interface era desenhado com
 * `box-shadow` do CSS. Isso tem teto — dá para acertar contraste, hierarquia e espaçamento e
 * ainda assim ler como página web tematizada, porque não é arte. Uma moldura de jogo tem canto
 * desenhado, textura e estado apertado; duas sombras internas não têm nenhum dos três.
 *
 * POR QUE REPINTAR: usar o pack como veio deixaria a casca com a paleta do Kenney e o mundo com
 * a nossa — colagem, não produto. Cada moldura tem quatro cores, e as quatro viram tokens nossos.
 *
 * UMA PEÇA, QUATRO ESTADOS: painel, botão, fenda e botão apertado saem todos do mesmo tile de
 * origem, com a moldura idêntica e só o miolo mudando de profundidade. Arte nova não é preciso, e
 * a família fica óbvia na tela.
 *
 * Uso: `pnpm ui` na raiz. As PNGs geradas são versionadas, então o build normal não depende disto.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng } from '../src/png.js'
import type { RgbaImage } from '../src/compose.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
/* A folha de origem vive em `tools/`, e não em `assets/`, porque `assets/` inteiro é gitignored:
 * lá o pack não viajaria com o repositório, `pnpm ui` não rodaria para quem clona, e a licença
 * CC0 que precisa acompanhar a arte ficaria de fora. */
const FOLHA = join(RAIZ, 'tools', 'assets', 'ui', 'kenney', 'tilemap-large-thick.png')
const SAIDA = join(RAIZ, 'packages', 'client', 'src', 'styles', 'ui')

/** A folha é uma grade de 32 px com 1 px de respiro, 13 colunas — como o Tilesheet.txt declara. */
const LADO = 32
const RESPIRO = 1
const COLUNAS = 13

/**
 * As quatro cores da moldura de madeira do pack, na ordem em que a peça as usa: miolo, luz da
 * borda, meio da borda e contorno. Toda repintura é um mapa sobre estas quatro.
 */
const ORIGEM = {
  miolo: '#fff1d2',
  luz: '#c58747',
  meio: '#a3703a',
  contorno: '#6d4b27',
} as const

/** O mundo novo: madeira da trilha do nosso atlas sobre superfície escura. */
const MADEIRA_LUZ = '#c9a173'
const MADEIRA_MEIO = '#a97c5c'
const MADEIRA_ESCURA = '#5d4438'

interface Peca {
  readonly nome: string
  readonly tile: number
  /** Mapa de cor, da peça de origem para a nossa. */
  readonly cores: Readonly<Record<string, string>>
}

/**
 * Quatro peças de uma origem só. A MOLDURA é a mesma nas quatro, e só o MIOLO muda de
 * profundidade: painel, botão levantado, fenda e botão apertado.
 *
 * A primeira tentativa invertia luz e contorno para fazer a fenda, que é o truque clássico de
 * relevo em pixel. Não serviu aqui: a peça do pack é simétrica nos quatro lados, então inverter
 * não vira "luz vindo de outro lugar" — vira um aro claro em volta de um buraco, que lê como
 * outro material, não como afundado. Com a moldura constante, o que diz a profundidade é o
 * miolo, e as quatro peças continuam sendo obviamente da mesma família.
 */
const MOLDURA = {
  [ORIGEM.luz]: MADEIRA_LUZ,
  [ORIGEM.meio]: MADEIRA_MEIO,
  [ORIGEM.contorno]: MADEIRA_ESCURA,
} as const

const PECAS: readonly Peca[] = [
  { nome: 'painel', tile: 0, cores: { ...MOLDURA, [ORIGEM.miolo]: '#2b231c' } },
  { nome: 'botao', tile: 0, cores: { ...MOLDURA, [ORIGEM.miolo]: '#3a3026' } },
  { nome: 'cava', tile: 0, cores: { ...MOLDURA, [ORIGEM.miolo]: '#12100d' } },
  { nome: 'botao-apertado', tile: 0, cores: { ...MOLDURA, [ORIGEM.miolo]: '#241d17' } },
]

const doHex = (hex: string): readonly [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const chave = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`

/** Recorta um tile da folha pelo índice, contando o respiro entre as células. */
function recortar(folha: RgbaImage, indice: number): RgbaImage {
  const cx = (indice % COLUNAS) * (LADO + RESPIRO)
  const cy = Math.floor(indice / COLUNAS) * (LADO + RESPIRO)
  const data = new Uint8Array(LADO * LADO * 4)
  for (let y = 0; y < LADO; y++) {
    for (let x = 0; x < LADO; x++) {
      const de = ((cy + y) * folha.width + cx + x) * 4
      const para = (y * LADO + x) * 4
      data.set(folha.data.subarray(de, de + 4), para)
    }
  }
  return { width: LADO, height: LADO, data }
}

/**
 * Troca cor por cor exata. Sem tolerância de propósito: a arte do pack é chapada, de quatro
 * cores, e uma cor fora do mapa é sinal de que a peça escolhida não é a que eu pensei — melhor
 * falhar alto do que repintar metade dela e entregar uma moldura de duas paletas.
 */
function repintar(img: RgbaImage, mapa: Readonly<Record<string, string>>, nome: string): RgbaImage {
  const destino = new Map(Object.entries(mapa).map(([de, para]) => [de, doHex(para)]))
  const data = new Uint8Array(img.data)
  const desconhecidas = new Set<string>()

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    const atual = chave(data[i]!, data[i + 1]!, data[i + 2]!)
    const nova = destino.get(atual)
    if (nova === undefined) { desconhecidas.add(atual); continue }
    data[i] = nova[0]
    data[i + 1] = nova[1]
    data[i + 2] = nova[2]
  }
  if (desconhecidas.size > 0) {
    throw new Error(`peça "${nome}": cor fora do mapa (${[...desconhecidas].join(', ')}); confira o índice do tile`)
  }
  return { width: img.width, height: img.height, data }
}

async function main(): Promise<void> {
  const folha = decodePng(await readFile(FOLHA))
  await mkdir(SAIDA, { recursive: true })
  for (const peca of PECAS) {
    const pintada = repintar(recortar(folha, peca.tile), peca.cores, peca.nome)
    const alvo = join(SAIDA, `${peca.nome}.png`)
    await writeFile(alvo, encodePng(pintada))
    process.stdout.write(`${peca.nome.padEnd(16)} tile ${String(peca.tile).padStart(2)} → ${alvo}\n`)
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`erro: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
