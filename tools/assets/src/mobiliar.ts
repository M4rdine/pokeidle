/**
 * Põe cenário numa área recortada do mundo.
 *
 * POR QUE ISTO EXISTE, já que a geografia vem pronta. Porque as cavernas deste `.otbm` são PELADAS.
 * Eu medi três vezes antes de aceitar: o único candidato subterrâneo com cenário tinha vegetação de
 * superfície vazando por um canto; na superfície, o que eu contava como decoração era em grande
 * parte BORDA DE TERRENO, não objeto; e não existe um só recorte rochoso mobiliado no mapa inteiro.
 * O autor desenhou corredor e rocha, e deixou o resto para os monstros. Então o cenário é posto —
 * mas com peças que ele usa de verdade, e com a lógica de quem senta no editor.
 *
 * AS REGRAS, e o que cada uma impede:
 *
 *  - ENCOSTADO NA PAREDE. Entulho se acumula no pé da rocha, não no meio do corredor. É a regra
 *    que separa "caverna mobiliada" de "confete": a primeira tentativa deste projeto espalhou
 *    arbusto uniformemente sobre grama e o resultado foi descrito como polvilhado.
 *  - RALO. "Um ou outro", e não um tapete. A densidade é por célula ANDÁVEL, porque é o corredor
 *    que se enxerga — contar sobre a área toda encheria de pedra uma caverna que é 66% parede.
 *  - ESPAÇADO. Duas peças coladas leem como uma mancha, não como dois objetos.
 *  - NÃO ISOLA. Pedra barra passagem. Uma pedra no lugar errado tranca uma sala, e o jogador fica
 *    olhando para uma área que nunca alcança: cada peça que barra é conferida por alcance antes de
 *    ser aceita, e recusada se fechar alguma coisa.
 *  - DETERMINÍSTICO. A mesma área dá sempre o mesmo resultado. Sem isso, reimportar embaralha o
 *    mapa e nenhuma revisão significa nada.
 */

export interface Prop {
  readonly nome: string
  readonly itemId: number
  /** Barra passagem — e por isso passa pela conferência de alcance. */
  readonly barra: boolean
  /** Peso relativo no sorteio. Pedra pequena é comum; pedregulho grande é evento. */
  readonly peso: number
}

export interface Ponto { readonly x: number; readonly y: number }

export interface Colocacao extends Ponto { readonly prop: Prop }

export interface Opcoes {
  /** Props por célula andável. */
  readonly densidade: number
  /** Fração das peças que nasce encostada na parede. */
  readonly juncaoParede: number
  /** Distância mínima entre duas peças, em tiles. */
  readonly distanciaMinima: number
  readonly semente: number
}

/**
 * Os números saíram de olhar, não de teoria. Com 0,05 e distância 3 a caverna continuava deserta
 * — vinte e uma peças em 283 células andáveis foi onde ela passou a parecer habitada sem virar
 * pedregulho a cada passo.
 */
export const OPCOES_PADRAO: Opcoes = {
  densidade: 0.1,
  juncaoParede: 0.6,
  distanciaMinima: 2,
  semente: 1,
}

/** `mulberry32`: gerador pequeno e reprodutível. Não precisa ser bom, precisa ser o mesmo sempre. */
function sorteador(semente: number): () => number {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Embaralha uma cópia. Fisher–Yates com o sorteador dado, para não tocar no array de quem chamou. */
function embaralhar<T>(itens: readonly T[], rng: () => number): T[] {
  const copia = [...itens]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j]!, copia[i]!]
  }
  return copia
}

/** Quantas células andáveis se alcança a partir de uma, andando em cruz. */
function alcance(bloqueio: readonly boolean[], largura: number, altura: number, de: number): number {
  const visto = new Uint8Array(bloqueio.length)
  const fila = [de]
  visto[de] = 1
  let n = 0
  while (fila.length > 0) {
    const i = fila.pop()!
    n++
    const x = i % largura
    const y = (i / largura) | 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= largura || ny >= altura) continue
      const j = ny * largura + nx
      if (visto[j] === 1 || bloqueio[j]) continue
      visto[j] = 1
      fila.push(j)
    }
  }
  return n
}

export interface Area {
  readonly largura: number
  readonly altura: number
  readonly bloqueio: readonly boolean[]
}

/**
 * Escolhe onde entra cada peça. Não muda nada: devolve as posições, e quem chamou escreve.
 *
 * `reservados` são as células que não podem receber nada — entrada, Centro Pokémon e os pontos de
 * nascimento. Uma pedra em cima do Centro seria invisível para este código e óbvia na tela.
 */
export function mobiliar(
  area: Area,
  paleta: readonly Prop[],
  reservados: readonly Ponto[],
  opcoes: Opcoes = OPCOES_PADRAO,
): Colocacao[] {
  const { largura, altura } = area
  if (paleta.length === 0) return []
  const rng = sorteador(opcoes.semente)
  const bloqueio = [...area.bloqueio]

  const parede = (x: number, y: number): boolean =>
    x < 0 || y < 0 || x >= largura || y >= altura || bloqueio[y * largura + x] === true

  const andaveis: number[] = []
  const encostados: number[] = []
  const abertos: number[] = []
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x
      if (bloqueio[i]) continue
      andaveis.push(i)
      const vizinhoParede = parede(x + 1, y) || parede(x - 1, y) || parede(x, y + 1) || parede(x, y - 1)
      ;(vizinhoParede ? encostados : abertos).push(i)
    }
  }
  if (andaveis.length === 0) return []
  const origem = andaveis[0]!
  const alcanceOriginal = alcance(bloqueio, largura, altura, origem)

  const alvo = Math.round(andaveis.length * opcoes.densidade)
  const daParede = Math.round(alvo * opcoes.juncaoParede)
  const candidatos = [
    ...embaralhar(encostados, rng).slice(0, daParede),
    ...embaralhar(abertos, rng).slice(0, alvo - daParede),
  ]

  const pesoTotal = paleta.reduce((s, p) => s + p.peso, 0)
  const sortearProp = (): Prop => {
    let r = rng() * pesoTotal
    for (const p of paleta) {
      r -= p.peso
      if (r <= 0) return p
    }
    return paleta[paleta.length - 1]!
  }

  const postos: Colocacao[] = []
  const longeDemaisPerto = (x: number, y: number): boolean =>
    [...postos, ...reservados].some((p) =>
      Math.abs(p.x - x) < opcoes.distanciaMinima && Math.abs(p.y - y) < opcoes.distanciaMinima)

  for (const i of candidatos) {
    if (postos.length >= alvo) break
    const x = i % largura
    const y = (i / largura) | 0
    // A origem da conferência de alcance precisa continuar andável: não se põe pedra nela.
    if (i === origem || longeDemaisPerto(x, y)) continue
    const prop = sortearProp()
    if (prop.barra) {
      bloqueio[i] = true
      // Trancar uma sala é pior do que ficar sem a pedra: na dúvida, a pedra não entra.
      if (alcance(bloqueio, largura, altura, origem) !== alcanceOriginal - postos.filter((p) => p.prop.barra).length - 1) {
        bloqueio[i] = false
        continue
      }
    }
    postos.push({ x, y, prop })
  }
  return postos
}
