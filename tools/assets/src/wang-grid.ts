/**
 * Lê um conjunto de terreno gerado (a grade que o Retro Diffusion devolve) e deduz, célula a
 * célula, qual combinação de cantos ela representa — amostrando os quatro quadrantes e
 * classificando cada um contra os dois materiais puros do próprio conjunto.
 *
 * Deduzir em vez de fixar uma tabela de posições é o que mantém isto funcionando se o gerador
 * mudar o arranjo da grade, que é fora do nosso controle.
 */
import type { RgbaImage } from './compose.js'
import { CORNER_CODES, composeTransition, transitionMask } from './transition.js'

const CELL = 32
const BYTES = 4
type Rgb = readonly [number, number, number]

/** Cor média do miolo de um quadrante, longe da borda onde os dois materiais se misturam. */
function quadrantColor(img: RgbaImage, cellX: number, cellY: number, right: boolean, bottom: boolean): Rgb {
  const x0 = cellX * CELL + (right ? 20 : 4)
  const y0 = cellY * CELL + (bottom ? 20 : 4)
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = y0; y < y0 + 8; y++) {
    for (let x = x0; x < x0 + 8; x++) {
      const i = (y * img.width + x) * BYTES
      r += img.data[i] ?? 0
      g += img.data[i + 1] ?? 0
      b += img.data[i + 2] ?? 0
      n++
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}

const dist2 = (a: Rgb, b: Rgb): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

/** Duas cores são o mesmo material quando a distância é pequena perto da que separa os materiais. */
const SAME_MATERIAL = 40 ** 2

function cutCell(img: RgbaImage, cellX: number, cellY: number): RgbaImage {
  const data = new Uint8Array(CELL * CELL * BYTES)
  for (let y = 0; y < CELL; y++) {
    const from = ((cellY * CELL + y) * img.width + cellX * CELL) * BYTES
    data.set(img.data.subarray(from, from + CELL * BYTES), y * CELL * BYTES)
  }
  return { width: CELL, height: CELL, data }
}

export interface WangGrid {
  /** Uma imagem de 32×32 por código de canto presente no conjunto. */
  readonly pieces: ReadonlyMap<string, RgbaImage>
  /**
   * Todas as células que produziram cada código, não só a primeira. As puras costumam aparecer
   * várias vezes na grade, e usar as repetidas como variação é o que evita campo chapado.
   */
  readonly variants: ReadonlyMap<string, readonly RgbaImage[]>
  /** Códigos que o gerador não entregou e o build compôs a partir das duas peças puras. */
  readonly synthesized: readonly string[]
  readonly fromColor: Rgb
  readonly toColor: Rgb
}

export interface WangGridOptions {
  readonly from: string
  readonly to: string
  /**
   * Troca qual material é lido como "from". O gerador decide sozinho qual material vira fundo e
   * qual vira mancha, e isso nem sempre bate com a intenção do prompt — quem cura olha a folha
   * de aprovação e liga esta chave quando o conjunto sai invertido.
   */
  readonly swap?: boolean | undefined
}

export function readWangGrid(img: RgbaImage, materials: WangGridOptions): WangGrid {
  if (img.width % CELL !== 0 || img.height % CELL !== 0) {
    throw new Error(`conjunto ${img.width}x${img.height} não é múltiplo de 32 em nenhuma direção`)
  }
  const cols = img.width / CELL
  const rows = img.height / CELL

  // Passo 1: as células puras dão as cores de referência dos dois materiais.
  const puras: Rgb[] = []
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const q = [
        quadrantColor(img, cx, cy, false, false),
        quadrantColor(img, cx, cy, true, false),
        quadrantColor(img, cx, cy, false, true),
        quadrantColor(img, cx, cy, true, true),
      ]
      if (q.every((c) => dist2(c, q[0]!) < SAME_MATERIAL)) puras.push(q[0]!)
    }
  }
  const grupos: { cor: Rgb; n: number }[] = []
  for (const c of puras) {
    const g = grupos.find((x) => dist2(x.cor, c) < SAME_MATERIAL)
    if (g) g.n++
    else grupos.push({ cor: c, n: 1 })
  }
  if (grupos.length < 2) {
    throw new Error(`conjunto de ${materials.from}/${materials.to} não tem dois materiais distintos: achei ${grupos.length}`)
  }
  const ordenados = [...grupos].sort((a, b) => b.n - a.n)
  const [primeira, segunda] = [ordenados[0]!.cor, ordenados[1]!.cor]
  const fromColor = materials.swap === true ? segunda : primeira
  const toColor = materials.swap === true ? primeira : segunda

  // Passo 2: o código de cada célula sai da classificação dos quadrantes.
  const classify = (c: Rgb): 'a' | 'b' => (dist2(c, fromColor) <= dist2(c, toColor) ? 'a' : 'b')
  const pieces = new Map<string, RgbaImage>()
  const variants = new Map<string, RgbaImage[]>()
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const topLeft = classify(quadrantColor(img, cx, cy, false, false))
      const topRight = classify(quadrantColor(img, cx, cy, true, false))
      const bottomLeft = classify(quadrantColor(img, cx, cy, false, true))
      const bottomRight = classify(quadrantColor(img, cx, cy, true, true))
      // Mesma ordem dos wangsets: superior-direito, inferior-direito, inferior-esquerdo, superior-esquerdo.
      const code = `${topRight}${bottomRight}${bottomLeft}${topLeft}`
      const cell = cutCell(img, cx, cy)
      if (!pieces.has(code)) pieces.set(code, cell)
      variants.set(code, [...(variants.get(code) ?? []), cell])
    }
  }
  // Passo 3: completa o que o gerador não entregou. Ele quase nunca devolve os códigos em
  // xadrez (bbaa, baba, abab...), e recusar a folha inteira por causa de cinco peças jogava fora
  // um conjunto bom. As que faltam saem das duas puras com a mesma máscara ruidosa das transições
  // sintéticas, então a borda combina com o resto do conjunto em vez de virar diagonal perfeita.
  // Passo 3: completa o que o gerador não entregou. Ele quase nunca devolve os códigos em xadrez
  // (bbaa, baba, abab...), e recusar a folha inteira por causa de cinco peças jogava fora um
  // conjunto bom. As que faltam saem das duas puras com a mesma máscara ruidosa das transições
  // sintéticas, então a borda combina com o resto do conjunto em vez de virar diagonal perfeita.
  // Quem decide se sintetizar demais é aceitável é quem conhece a procedência da folha; aqui só
  // se lê e se completa. As duas puras existem: sem elas o passo 1 já teria recusado a folha.
  const faltando = CORNER_CODES.filter((c) => !pieces.has(c))
  const puraA = pieces.get('aaaa')!
  const puraB = pieces.get('bbbb')!
  for (const [i, code] of CORNER_CODES.entries()) {
    if (pieces.has(code)) continue
    pieces.set(code, composeTransition(puraA, puraB, transitionMask(code, i + 1)))
  }

  return { pieces, variants, synthesized: faltando, fromColor, toColor }
}
