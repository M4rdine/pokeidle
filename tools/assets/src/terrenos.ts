/**
 * QUE TERRENO É ESTE TILE, pela cor média do desenho dele.
 *
 * O `.otbm` diz o id do chão e nada sobre o que ele representa: não há nome, nem bioma, nem
 * etiqueta. Mas a cor não mente — grama é verde, areia é bege, água é azul, rocha é cinza. Medir a
 * média dos pixels opacos de cada sprite de chão dá uma triagem boa o bastante para PROCURAR, que
 * é tudo o que se pede aqui: quem decide se o lugar presta é o olho, depois, olhando o desenho.
 *
 * Existe porque sem isso o localizador de lugares é cego a tema. Ele achava cavernas ótimas e as
 * ofereceria para a Praia Longa com a mesma convicção.
 *
 * O CINZA É DECIDIDO PELA SATURAÇÃO, não pelo tom: pedra vai de quase branco a quase preto, e o
 * que ela nunca tem é cor. Por isso a falta de saturação é testada antes de qualquer canal.
 */
export type ClasseDeTerreno = 'grama' | 'areia' | 'agua' | 'pedra' | 'terra' | 'neve' | 'escuro'

/** Abaixo disto o sprite é escuro demais para ter tema — vazio de caverna, sombra, buraco. */
const PISO_DE_LUZ = 70
/** Diferença entre o canal mais forte e o mais fraco. Abaixo disto não há cor, só tom. */
const SATURACAO_MINIMA = 26
/** Acima disto, cinza vira neve. */
const NEVE = 190
/** Piso de vermelho e verde para bege; azul baixo é o que separa areia de pedra clara. */
const AREIA_QUENTE = 150
const AREIA_VERDE = 120
const AREIA_AZUL = 140

export function classeDaCor(cor: readonly [number, number, number] | null): ClasseDeTerreno | null {
  if (!cor) return null
  const [r, g, b] = cor
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max < PISO_DE_LUZ) return 'escuro'
  if (max - min < SATURACAO_MINIMA) return max > NEVE ? 'neve' : 'pedra'
  if (b > r && b > g) return 'agua'
  if (g > r && g > b) return 'grama'
  if (r > AREIA_QUENTE && g > AREIA_VERDE && b < AREIA_AZUL) return 'areia'
  return 'terra'
}

/** Quanto de cada classe há num conjunto de tiles, em fração do total. */
export function composicao(classes: readonly (ClasseDeTerreno | null)[]): Readonly<Record<string, number>> {
  const contagem = new Map<string, number>()
  for (const c of classes) if (c) contagem.set(c, (contagem.get(c) ?? 0) + 1)
  const total = classes.length || 1
  return Object.fromEntries([...contagem].map(([k, n]) => [k, n / total]))
}

/** Uma faixa aceita por classe. Ausente = não importa. */
export type Exigencia = Partial<Record<ClasseDeTerreno, readonly [number, number]>>

export const atende = (comp: Readonly<Record<string, number>>, exigencia: Exigencia): boolean =>
  Object.entries(exigencia).every(([classe, faixa]) => {
    const tem = comp[classe] ?? 0
    return tem >= faixa![0] && tem <= faixa![1]
  })
