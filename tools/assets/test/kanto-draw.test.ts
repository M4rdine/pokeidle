import { describe, expect, it } from 'vitest'
import { BIOMAS } from '../src/kanto-biomas.js'
import { desenharKanto, KANTO } from '../src/kanto-draw.js'

/** Atlas de mentira: só as variações de peça pura são opcionais, então é o que o teste varia. */
const comVariacoes = (nome: string): boolean => /-v[234]$/.test(nome)
const semVariacoes = (): boolean => false

describe('desenharKanto', () => {
  it('é determinístico: mesma entrada, mesmo desenho', () => {
    expect(desenharKanto(comVariacoes)).toEqual(desenharKanto(comVariacoes))
  })

  it('preenche a grade inteira e dá a cada área o pincel do seu bioma', () => {
    const draft = desenharKanto(comVariacoes)
    expect(draft.ground).toHaveLength(KANTO.width * KANTO.height)
    expect(draft.ground.filter((n) => n === '')).toEqual([])

    const porLinha = Math.floor(KANTO.width / KANTO.areaWidth)
    BIOMAS.forEach((bioma, indice) => {
      const ax = (indice % porLinha) * KANTO.areaWidth
      const ay = Math.floor(indice / porLinha) * KANTO.areaHeight
      const nomes = new Set<string>()
      for (let y = 0; y < KANTO.areaHeight; y++) {
        for (let x = 0; x < KANTO.areaWidth; x++) nomes.add(draft.ground[(ay + y) * KANTO.width + ax + x]!)
      }
      for (const nome of nomes) expect(nome, `área ${bioma.id}`).toMatch(new RegExp(`^${bioma.set}-`))
    })
  })

  it('sem variações no atlas, usa só a peça base — nunca um nome que não existe', () => {
    const draft = desenharKanto(semVariacoes)
    expect(draft.ground.filter((n) => /-v\d$/.test(n))).toEqual([])
  })

  it('cada área ganha retângulo, partida, Centro e um spawn por espécie', () => {
    const { objetos } = desenharKanto(comVariacoes)
    const esperadoDeSpawns = BIOMAS.reduce((total, b) => total + b.especies.length, 0)
    expect(objetos.filter((o) => o.classe === 'area')).toHaveLength(BIOMAS.length)
    expect(objetos.filter((o) => o.classe === 'spawnPoint')).toHaveLength(BIOMAS.length)
    expect(objetos.filter((o) => o.classe === 'pokecenter')).toHaveLength(BIOMAS.length)
    expect(objetos.filter((o) => o.classe === 'spawn')).toHaveLength(esperadoDeSpawns)
  })

  it('nenhum objeto nasce fora da sua área, e partida e Centro ficam em tile andável', () => {
    const draft = desenharKanto(comVariacoes)
    const porLinha = Math.floor(KANTO.width / KANTO.areaWidth)
    const areas = new Map(BIOMAS.map((b, i) => [b.id, {
      ax: (i % porLinha) * KANTO.areaWidth, ay: Math.floor(i / porLinha) * KANTO.areaHeight,
    }]))

    let areaAtual = { ax: 0, ay: 0 }
    for (const o of draft.objetos) {
      if (o.classe === 'area') { areaAtual = areas.get(o.nome)!; continue }
      const tx = Math.floor((o.x + o.width / 2) / KANTO.tileSize)
      const ty = Math.floor((o.y + o.height / 2) / KANTO.tileSize)
      expect(tx, o.nome).toBeGreaterThanOrEqual(areaAtual.ax)
      expect(tx, o.nome).toBeLessThan(areaAtual.ax + KANTO.areaWidth)
      expect(ty, o.nome).toBeGreaterThanOrEqual(areaAtual.ay)
      expect(ty, o.nome).toBeLessThan(areaAtual.ay + KANTO.areaHeight)
      if (o.classe === 'spawn') continue
      expect(draft.blocked[ty * KANTO.width + tx], `${o.nome} em tile bloqueado`).toBe(false)
    }
  })

  it('árvore ocupa 2×2: copa em cima, tronco bloqueando embaixo', () => {
    const draft = desenharKanto(comVariacoes)
    const copas = draft.canopy
      .map((n, i) => ({ n, i }))
      .filter((c): c is { n: string; i: number } => c.n !== null && c.n.endsWith('-x0-y0'))
    expect(copas.length).toBeGreaterThan(0)
    for (const copa of copas) {
      const abaixo = copa.i + KANTO.width
      expect(draft.canopy[copa.i + 1]).toBe(copa.n.replace('-x0-y0', '-x1-y0'))
      expect(draft.detail[abaixo]).toBe(copa.n.replace('-x0-y0', '-x0-y1'))
      expect(draft.blocked[abaixo]).toBe(true)
      expect(draft.blocked[abaixo + 1]).toBe(true)
    }
  })
})
