/**
 * O cenário posto precisa parecer AUTORADO, e a diferença entre autorado e polvilhado cabe em
 * poucas regras. Cada caso aqui nomeia uma delas pelo defeito que ela impede.
 */
import { describe, expect, it } from 'vitest'
import { mobiliar, OPCOES_PADRAO, type Area, type Prop } from '../src/mobiliar.js'

const PEDRA: Prop = { nome: 'pedra', itemId: 2166, barra: true, peso: 1 }
const MUSGO: Prop = { nome: 'musgo', itemId: 2167, barra: false, peso: 1 }

/** `#` é parede, `.` é chão. */
function area(desenho: readonly string[]): Area {
  const largura = desenho[0]!.length
  return {
    largura,
    altura: desenho.length,
    bloqueio: desenho.flatMap((linha) => [...linha].map((c) => c === '#')),
  }
}

const sala = area(Array.from({ length: 14 }, (_, y) =>
  y === 0 || y === 13 ? '#'.repeat(14) : `#${'.'.repeat(12)}#`))

describe('mobiliar', () => {
  it('põe peça, e ralo: "um ou outro", não um tapete', () => {
    const postos = mobiliar(sala, [MUSGO], [], OPCOES_PADRAO)
    const andaveis = sala.bloqueio.filter((b) => !b).length
    expect(postos.length).toBeGreaterThan(0)
    expect(postos.length).toBeLessThanOrEqual(Math.round(andaveis * OPCOES_PADRAO.densidade))
  })

  it('repete o mesmo resultado para a mesma semente, senão revisar o mapa não significa nada', () => {
    const a = mobiliar(sala, [MUSGO, PEDRA], [], OPCOES_PADRAO)
    const b = mobiliar(sala, [MUSGO, PEDRA], [], OPCOES_PADRAO)
    expect(a).toEqual(b)
  })

  it('muda com a semente', () => {
    const a = mobiliar(sala, [MUSGO], [], OPCOES_PADRAO)
    const b = mobiliar(sala, [MUSGO], [], { ...OPCOES_PADRAO, semente: 99 })
    expect(a).not.toEqual(b)
  })

  it('nunca põe peça em cima de parede', () => {
    for (const p of mobiliar(sala, [MUSGO, PEDRA], [], OPCOES_PADRAO)) {
      expect(sala.bloqueio[p.y * sala.largura + p.x]).toBe(false)
    }
  })

  it('não encosta duas peças: coladas leem como mancha, não como dois objetos', () => {
    const postos = mobiliar(sala, [MUSGO], [], OPCOES_PADRAO)
    for (const a of postos) {
      for (const b of postos) {
        if (a === b) continue
        const colado = Math.abs(a.x - b.x) < OPCOES_PADRAO.distanciaMinima
          && Math.abs(a.y - b.y) < OPCOES_PADRAO.distanciaMinima
        expect(colado, `${a.x},${a.y} colado em ${b.x},${b.y}`).toBe(false)
      }
    }
  })

  it('respeita o que foi reservado — entrada, Centro e os pontos de nascimento', () => {
    const reservado = { x: 6, y: 6 }
    for (const p of mobiliar(sala, [MUSGO, PEDRA], [reservado], OPCOES_PADRAO)) {
      expect(Math.abs(p.x - reservado.x) >= 3 || Math.abs(p.y - reservado.y) >= 3).toBe(true)
    }
  })

  it('nunca tranca a ponte de um tile entre duas salas', () => {
    /*
     * Duas salas ligadas por UMA célula. É o caso que importa: pedra na ponta de um corredor só o
     * encurta, mas pedra na ponte deixa metade do mapa inalcançável. A densidade vai ao teto para
     * que a ponte seja mesmo tentada.
     */
    const duasSalas = area([
      '##########',
      '#...##...#',
      '#...##...#',
      '#....,...#'.replace(',', '.'),
      '#...##...#',
      '##########',
    ])
    const ponte = { x: 4, y: 3 }
    const postos = mobiliar(duasSalas, [PEDRA], [], { ...OPCOES_PADRAO, densidade: 1, juncaoParede: 1, distanciaMinima: 1 })
    expect(postos.length).toBeGreaterThan(0)
    expect(postos.some((p) => p.x === ponte.x && p.y === ponte.y)).toBe(false)
  })

  it('o mapa continua inteiro depois de mobiliado: tudo alcança tudo', () => {
    const duasSalas = area([
      '##########',
      '#...##...#',
      '#...##...#',
      '#........#',
      '#...##...#',
      '##########',
    ])
    const postos = mobiliar(duasSalas, [PEDRA, MUSGO], [], { ...OPCOES_PADRAO, densidade: 1, distanciaMinima: 1 })
    const bloqueio = [...duasSalas.bloqueio]
    for (const p of postos) if (p.prop.barra) bloqueio[p.y * duasSalas.largura + p.x] = true

    const livres = bloqueio.flatMap((b, i) => (b ? [] : [i]))
    const visto = new Set<number>([livres[0]!])
    const fila = [livres[0]!]
    while (fila.length > 0) {
      const i = fila.pop()!
      for (const j of [i + 1, i - 1, i + duasSalas.largura, i - duasSalas.largura]) {
        if (j < 0 || j >= bloqueio.length || bloqueio[j] || visto.has(j)) continue
        // Em cruz de verdade: o índice vizinho na horizontal tem que estar na mesma linha.
        if (Math.abs(j - i) === 1 && Math.floor(j / duasSalas.largura) !== Math.floor(i / duasSalas.largura)) continue
        visto.add(j)
        fila.push(j)
      }
    }
    expect(visto.size).toBe(livres.length)
  })

  it('sem paleta não inventa nada', () => {
    expect(mobiliar(sala, [], [], OPCOES_PADRAO)).toEqual([])
  })
})
