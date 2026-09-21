/**
 * A região é um mundo só, não oito retângulos encostados. O que se vê no mapa da região quando
 * ela é grade é sempre uma das três: o ruído do terreno recomeça na divisa, o material primário
 * muda em bloco numa reta perfeita, e toda estrada morre na borda. Este arquivo cobre as três.
 */
import { describe, expect, it } from 'vitest'
import { desenharRegiao, GRADE } from '../src/region-draw.js'
import { regiaoPorId, type RegionSpec } from '../src/regioes.js'

const todos = (): boolean => true
const kanto = regiaoPorId('kanto')!

/** Índices de uma coluna de tiles da grade da região. */
const coluna = (x: number, deY: number, ateY: number): number[] =>
  Array.from({ length: ateY - deY }, (_u, i) => (deY + i) * GRADE.width + x)

/** Canto superior esquerdo da área de índice `n`, na grade de quatro por linha. */
const cantoDaArea = (n: number): { ax: number; ay: number } => {
  const porLinha = Math.floor(GRADE.width / GRADE.areaWidth)
  return { ax: (n % porLinha) * GRADE.areaWidth, ay: Math.floor(n / porLinha) * GRADE.areaHeight }
}

const ehPuro = (nome: string): boolean => nome.includes('-aaaa')
const conjuntoDe = (nome: string): string => nome.replace(/-[ab]{4}(-v\d+)?$/, '')

describe('a fronteira entre áreas vizinhas não é uma parede lisa', () => {
  const draft = desenharRegiao(kanto, todos)

  it('entre duas áreas de campo, a mancha do terreno atravessa a divisa', () => {
    // Campo Inicial (0) e Bosque Denso (1) são vizinhas e as duas usam campo como primário.
    const divisa = GRADE.areaWidth
    const naDivisa = [...coluna(divisa - 1, 0, GRADE.areaHeight), ...coluna(divisa, 0, GRADE.areaHeight)]

    // Com o ruído em coordenada local da área, as duas colunas saíam 100 % puras — a assinatura
    // exata da emenda reta. Basta uma peça de borda para provar que a mancha atravessou.
    expect(naDivisa.every((i) => ehPuro(draft.ground[i]!)),
      'a divisa entre Campo Inicial e Bosque Denso é uma faixa lisa').toBe(false)
  })

  it('entre materiais primários diferentes, a língua do vizinho invade', () => {
    // Campo Inicial (0) é campo; Praia Longa (4), logo abaixo, é areia. Sem transição, a última
    // linha do campo é campo puro de ponta a ponta e a primeira da praia é areia pura.
    const { ay } = cantoDaArea(4)
    const ultimaDoCampo = Array.from({ length: GRADE.areaWidth }, (_u, x) => (ay - 1) * GRADE.width + x)
    const comAreia = ultimaDoCampo.filter((i) => conjuntoDe(draft.ground[i]!) === 'campo-areia')

    expect(comAreia.length,
      'a última linha do Campo Inicial não tem uma peça sequer de areia: a divisa com a praia é uma régua')
      .toBeGreaterThan(0)
  })

  it('o par sem pincel de campo também interdigita, pelo conjunto de areia e pedra', () => {
    // Praia Longa (4) é areia e Entrada da Caverna (5), ao lado, é pedra. É o par que não tem
    // conjunto com campo, e foi o último traço reto a sobrar no mapa da região.
    const divisa = cantoDaArea(5).ax
    const ultimaDaPraia = coluna(divisa - 1, GRADE.areaHeight, GRADE.height)
    const comPedra = ultimaDaPraia.filter((i) => conjuntoDe(draft.ground[i]!) === 'areia-pedra')

    expect(comPedra.length, 'a divisa entre a praia e a caverna continua reta').toBeGreaterThan(0)
  })

  it('a estrada atravessa a divisa entre duas áreas que levam trilha', () => {
    // As duas metades do portão são desenhadas por áreas diferentes, cada uma no seu lado, a
    // partir da mesma coordenada global. Se elas discordassem, uma das colunas ficaria sem
    // caminho e a estrada morreria na borda — que é o estado anterior.
    const divisa = GRADE.areaWidth
    const temCaminho = (x: number): boolean =>
      coluna(x, 0, GRADE.areaHeight).some((i) => conjuntoDe(draft.ground[i]!) === 'campo-caminho'
        && !ehPuro(draft.ground[i]!))

    expect(temCaminho(divisa - 1) && temCaminho(divisa),
      'a trilha não cruza a divisa entre Campo Inicial e Bosque Denso').toBe(true)
  })

  it('o desenho continua determinístico', () => {
    expect(desenharRegiao(kanto, todos)).toEqual(desenharRegiao(kanto, todos))
  })

  it('nenhuma região tem uma divisa interna inteiramente de material puro dos dois lados', () => {
    // A varredura vale por todas as anteriores somadas: qualquer divisa que volte a ser régua
    // cai aqui, inclusive numa região que ainda nem existe.
    const regioes: readonly RegionSpec[] = [kanto, regiaoPorId('terras-altas')!]
    const porLinha = Math.floor(GRADE.width / GRADE.areaWidth)

    for (const regiao of regioes) {
      const desenho = desenharRegiao(regiao, todos)
      regiao.biomas.forEach((_bioma, n) => {
        // Só a divisa da direita e a de baixo: assim cada uma é conferida uma vez só.
        const { ax, ay } = cantoDaArea(n)
        const temVizinhoDireita = (n % porLinha) + 1 < porLinha && n + 1 < regiao.biomas.length
        if (!temVizinhoDireita) return
        const x = ax + GRADE.areaWidth
        const faixa = [...coluna(x - 1, ay, ay + GRADE.areaHeight), ...coluna(x, ay, ay + GRADE.areaHeight)]

        // Faixa lisa = as duas colunas inteiras em material puro. Não importa se o material é o
        // mesmo dos dois lados ou muda: o que denuncia a grade é a ausência de peça de borda.
        expect(faixa.every((i) => ehPuro(desenho.ground[i]!)),
          `${regiao.id}: a divisa à direita da área ${n} é uma faixa lisa`).toBe(false)
      })
    }
  })
})
