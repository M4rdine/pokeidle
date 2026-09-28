import { describe, expect, it } from 'vitest'
import { LIMITES_PADRAO, aprovado, medir, procurar, type Limites, type Plano } from '../src/lugares.js'

const LADO = 10

/** Um andar de `LADO`×`LADO` desenhado com caracteres: `.` anda, `#` bloqueia, ` ` é vazio. */
function plano(desenho: readonly string[]): Plano {
  const largura = desenho[0]!.length
  const altura = desenho.length
  const p = {
    largura, altura,
    temChao: new Uint8Array(largura * altura),
    bloqueia: new Uint8Array(largura * altura),
    casa: new Uint8Array(largura * altura),
  }
  desenho.forEach((linha, y) => {
    [...linha].forEach((c, x) => {
      const i = y * largura + x
      if (c === ' ') return
      p.temChao[i] = 1
      if (c === '#') p.bloqueia[i] = 1
      if (c === 'C') p.casa[i] = 1
    })
  })
  return p
}

const caverna = plano([
  '##########',
  '#........#',
  '#.##..##.#',
  '#.##..##.#',
  '#........#',
  '#..####..#',
  '#........#',
  '#.##..##.#',
  '#........#',
  '##########',
])

const campoAberto = plano(Array.from({ length: LADO }, () => '.'.repeat(LADO)))
const limites: Limites = { ...LIMITES_PADRAO, largura: LADO, altura: LADO, passo: 1 }

describe('medir', () => {
  it('dá vedação total à sala cercada de rocha', () => {
    expect(medir(caverna, 0, 0, LADO, LADO).vedado).toBe(1)
  })

  it('dá vedação zero ao campo aberto, que é o que faz o mapa parecer cortado', () => {
    expect(medir(campoAberto, 0, 0, LADO, LADO).vedado).toBe(0)
  })

  it('conta como buraco o tile sem chão, que desenha um furo transparente', () => {
    const comFuro = plano([
      '##########', '#........#', '#........#', '#...  ...#', '#...  ...#',
      '#........#', '#........#', '#........#', '#........#', '##########',
    ])
    expect(medir(comFuro, 0, 0, LADO, LADO).buracos).toBe(4)
  })

  it('não conta como ilha a sala que a parede isola', () => {
    const salaMurada = plano([
      '##########', '#....#...#', '#....#...#', '#....#...#', '#....#...#',
      '#....#...#', '#....#...#', '#....#...#', '#....#...#', '##########',
    ])
    // A sala da direita tem 24 dos 56 andáveis; a maior ilha é a da esquerda, com 32.
    expect(medir(salaMurada, 0, 0, LADO, LADO).ilha).toBeCloseTo(32 / 56, 5)
  })

  it('não trata como passagem o encontro só na diagonal, porque não se anda na diagonal', () => {
    const diagonal = plano([
      '##########', '#...#....#', '#...#....#', '#...#....#', '#....#...#',
      '#...#....#', '#...#....#', '#...#....#', '#...#....#', '##########',
    ])
    expect(medir(diagonal, 0, 0, LADO, LADO).ilha).toBeLessThan(1)
  })
})

describe('aprovado', () => {
  it('reprova o campo aberto', () => {
    expect(aprovado(medir(campoAberto, 0, 0, LADO, LADO), limites)).toBe(false)
  })

  it('reprova o lugar com tile de casa, porque calçada de pedra é cidade e não hunt', () => {
    const comCasa = plano([
      '##########', '#........#', '#..CC....#', '#..CC....#', '#........#',
      '#..####..#', '#........#', '#.##..##.#', '#........#', '##########',
    ])
    expect(medir(comCasa, 0, 0, LADO, LADO).casas).toBe(4)
    expect(aprovado(medir(comCasa, 0, 0, LADO, LADO), limites)).toBe(false)
  })

  it('aprova a caverna', () => {
    expect(aprovado(medir(caverna, 0, 0, LADO, LADO), limites)).toBe(true)
  })
})

describe('procurar', () => {
  it('acha a caverna e não devolve a mesma vizinhança duas vezes', () => {
    const achados = procurar(caverna, limites)
    expect(achados).toHaveLength(1)
    expect(achados[0]).toMatchObject({ x: 0, y: 0 })
  })

  it('não acha nada em campo aberto', () => {
    expect(procurar(campoAberto, limites)).toHaveLength(0)
  })
})
