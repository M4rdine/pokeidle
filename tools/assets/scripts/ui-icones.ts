/**
 * Os ícones da interface, em duas origens.
 *
 * ASSUNTO — mapa, time, mochila, Pokédex, loja, configurações: **sprite oficial** do acervo da
 * PokeAPI (`PokeAPI/sprites`, CC0). Nada de símbolo desenhado por nós quando existe o do próprio
 * jogo: a fidelidade sai de graça e nenhum desenho nosso chega perto. Uma rodada inteira foi
 * gasta antes disto — três estilos do Retro Diffusion falharam porque gerador produz ilustração
 * e ícone é símbolo, e depois seis símbolos desenhados à mão ficaram só aceitáveis. A resposta
 * era usar a arte que o jogo já tem.
 *
 * CONTROLE — mais, menos, parar, cadeado, fechar: não existem como item do jogo, então vêm do
 * pack do VerzatileDev (CC0) e são repintados na nossa paleta. A repintura é por LUMINÂNCIA: a
 * folha é sombreada, um ícone usa oito tons de azul, e uma tabela de-para quebraria no primeiro
 * que tivesse um tom a mais.
 *
 * Os sprites oficiais NÃO são repintados: a cor deles é o ponto.
 *
 * Uso: `pnpm icones` na raiz. As PNGs geradas são versionadas, então o build normal não depende
 * deste passo nem da rede.
 */
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng } from '../src/png.js'
import type { RgbaImage } from '../src/compose.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const FOLHA_CONTROLE = join(RAIZ, 'tools', 'assets', 'ui', 'verzatile', 'icones-32.png')
const OFICIAIS = join(RAIZ, 'tools', 'assets', 'ui', 'pokeapi')
const SAIDA = join(RAIZ, 'packages', 'client', 'src', 'styles', 'ui')

/** A folha de controle é uma grade de 8×8 de 32 px, sem respiro entre as células. */
const LADO = 32
const COLUNAS = 8

/** Extremos da rampa de repintura: a borda de controle e o texto do tema. */
const SOMBRA = [0x3a, 0x45, 0x60] as const
const CLARO = [0xee, 0xf1, 0xf8] as const

/**
 * O item oficial que responde por cada função. A escolha é por LEITURA a 22 px, não por nome:
 * `medal-box` é um fichário e lê como registro de espécies melhor que o `poke-radar`, que a
 * esse tamanho vira dois objetos sobrepostos.
 *
 * `configuracoes` é o único sem correspondente honesto — não existe engrenagem no acervo, porque
 * engrenagem é convenção de interface e não item de Pokémon. `machine-part` é o mais próximo.
 */
const DE_ASSUNTO: readonly { readonly nome: string; readonly item: string }[] = [
  { nome: 'mapa', item: 'town-map' },
  { nome: 'time', item: 'poke-ball' },
  { nome: 'mochila', item: 'berry-pouch' },
  { nome: 'pokedex', item: 'medal-box' },
  { nome: 'loja', item: 'coin-case' },
  { nome: 'configuracoes', item: 'machine-part' },
]

const DE_CONTROLE: readonly { readonly nome: string; readonly tile: number }[] = [
  { nome: 'mais', tile: 33 },
  { nome: 'menos', tile: 34 },
  { nome: 'parar', tile: 3 },
  { nome: 'cadeado', tile: 50 },
  { nome: 'fechar', tile: 35 },
]

/** Recorta um tile da folha de controle pelo índice. */
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
function repintar(img: RgbaImage): RgbaImage {
  let min = 1
  let max = 0
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3]! === 0) continue
    const l = brilho(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!)
    if (l < min) min = l
    if (l > max) max = l
  }
  const vao = max - min || 1
  const data = new Uint8Array(img.data)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! === 0) continue
    const t = Math.min(1, Math.max(0, (brilho(data[i]!, data[i + 1]!, data[i + 2]!) - min) / vao))
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(SOMBRA[c]! + (CLARO[c]! - SOMBRA[c]!) * t)
  }
  return { width: img.width, height: img.height, data }
}

async function main(): Promise<void> {
  await mkdir(SAIDA, { recursive: true })

  for (const { nome, item } of DE_ASSUNTO) {
    const origem = join(OFICIAIS, `${item}.png`)
    let bruto
    try {
      bruto = await readFile(origem)
    } catch {
      throw new Error(`falta o sprite oficial em ${origem}. Rode "pnpm icones-baixar" para trazer o acervo.`)
    }
    // Sem repintura: a cor do item oficial é o ponto, e é ela que faz o ícone ser do jogo.
    await writeFile(join(SAIDA, `icone-${nome}.png`), encodePng(decodePng(bruto)))
    process.stdout.write(`${nome.padEnd(16)} oficial  ${item}\n`)
  }

  const folha = decodePng(await readFile(FOLHA_CONTROLE))
  for (const { nome, tile } of DE_CONTROLE) {
    await writeFile(join(SAIDA, `icone-${nome}.png`), encodePng(repintar(recortar(folha, tile))))
    process.stdout.write(`${nome.padEnd(16)} controle tile ${tile}\n`)
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`erro: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
