import { describe, expect, it } from 'vitest'
import { desenharRegiao, GRADE } from '../src/region-draw.js'
import { REGIOES, regiaoPorId } from '../src/regioes.js'

/** Atlas de mentira: só as variações de peça pura são opcionais, então é o que o teste varia. */
const comVariacoes = (nome: string): boolean => /-v[234]$/.test(nome)
const semVariacoes = (): boolean => false

const kanto = regiaoPorId('kanto')!
const BIOMAS = kanto.biomas

describe('desenharRegiao', () => {
  it('é determinístico: mesma entrada, mesmo desenho', () => {
    expect(desenharRegiao(kanto, comVariacoes)).toEqual(desenharRegiao(kanto, comVariacoes))
  })

  it('preenche a grade inteira e dá a cada área o pincel do seu bioma', () => {
    const draft = desenharRegiao(kanto, comVariacoes)
    expect(draft.ground).toHaveLength(GRADE.width * GRADE.height)
    expect(draft.ground.filter((n) => n === '')).toEqual([])

    const porLinha = Math.floor(GRADE.width / GRADE.areaWidth)
    BIOMAS.forEach((bioma, indice) => {
      const ax = (indice % porLinha) * GRADE.areaWidth
      const ay = Math.floor(indice / porLinha) * GRADE.areaHeight
      const nomes = new Set<string>()
      for (let y = 0; y < GRADE.areaHeight; y++) {
        for (let x = 0; x < GRADE.areaWidth; x++) nomes.add(draft.ground[(ay + y) * GRADE.width + ax + x]!)
      }
      // A trilha é o único conjunto de fora que pode aparecer: ela atravessa a área de propósito.
      const deFora = [...nomes].filter((n) =>
        !n.startsWith(`${bioma.set}-`) && !(bioma.trilha !== null && n.startsWith(`${bioma.trilha}-`)))
      expect(deFora, `área ${bioma.id}`).toEqual([])
    })
  })

  it('bioma com trilha ganha um corredor de terra que chega ao Centro; sem trilha, nenhum tile dela', () => {
    const draft = desenharRegiao(kanto, comVariacoes)
    const porLinha = Math.floor(GRADE.width / GRADE.areaWidth)
    const centroDaArea = new Map<string, number>()
    let atual = ''
    for (const o of draft.objetos) {
      if (o.classe === 'area') { atual = o.nome; continue }
      if (o.classe === 'pokecenter') {
        centroDaArea.set(atual, Math.floor(o.y / GRADE.tileSize) * GRADE.width + Math.floor(o.x / GRADE.tileSize))
      }
    }

    BIOMAS.forEach((bioma, indice) => {
      const ax = (indice % porLinha) * GRADE.areaWidth
      const ay = Math.floor(indice / porLinha) * GRADE.areaHeight
      // Só peça com canto do segundo material conta: a peça pura do conjunto de caminho é campo,
      // e em bioma de campo ela é o próprio terreno.
      const eTrilha = (nome: string): boolean =>
        bioma.trilha !== null && nome.startsWith(`${bioma.trilha}-`) && nome.slice(bioma.trilha.length + 1, bioma.trilha.length + 5).includes('b')
      let terra = 0
      for (let y = 0; y < GRADE.areaHeight; y++) {
        for (let x = 0; x < GRADE.areaWidth; x++) {
          if (eTrilha(draft.ground[(ay + y) * GRADE.width + ax + x]!)) terra++
        }
      }
      if (bioma.trilha === null) {
        expect(terra, `${bioma.id} não devia ter trilha`).toBe(0)
        return
      }
      expect(terra, `trilha de ${bioma.id}`).toBeGreaterThan(5)
      // O Centro fica no fim da trilha: é o que a spec promete ao dizer que ela passa pelos Centros.
      expect(eTrilha(draft.ground[centroDaArea.get(bioma.id)!]!), `Centro de ${bioma.id} fora da trilha`).toBe(true)
    })
  })

  it('nenhum prop ocupa a célula da partida ou do Centro', () => {
    const draft = desenharRegiao(kanto, comVariacoes)
    for (const o of draft.objetos) {
      if (o.classe !== 'spawnPoint' && o.classe !== 'pokecenter') continue
      const i = Math.floor(o.y / GRADE.tileSize) * GRADE.width + Math.floor(o.x / GRADE.tileSize)
      expect(draft.detail[i], o.nome).toBeNull()
      expect(draft.canopy[i], o.nome).toBeNull()
      expect(draft.blocked[i], o.nome).toBe(false)
    }
  })

  it('sem variações no atlas, usa só a peça base — nunca um nome que não existe', () => {
    const draft = desenharRegiao(kanto, semVariacoes)
    expect(draft.ground.filter((n) => /-v\d$/.test(n))).toEqual([])
  })

  it('cada área ganha retângulo, partida, Centro e um spawn por espécie', () => {
    const { objetos } = desenharRegiao(kanto, comVariacoes)
    const esperadoDeSpawns = BIOMAS.reduce((total, b) => total + b.especies.length, 0)
    expect(objetos.filter((o) => o.classe === 'area')).toHaveLength(BIOMAS.length)
    expect(objetos.filter((o) => o.classe === 'spawnPoint')).toHaveLength(BIOMAS.length)
    expect(objetos.filter((o) => o.classe === 'pokecenter')).toHaveLength(BIOMAS.length)
    expect(objetos.filter((o) => o.classe === 'spawn')).toHaveLength(esperadoDeSpawns)
  })

  it('nenhum objeto nasce fora da sua área, e partida e Centro ficam em tile andável', () => {
    const draft = desenharRegiao(kanto, comVariacoes)
    const porLinha = Math.floor(GRADE.width / GRADE.areaWidth)
    const areas = new Map(BIOMAS.map((b, i) => [b.id, {
      ax: (i % porLinha) * GRADE.areaWidth, ay: Math.floor(i / porLinha) * GRADE.areaHeight,
    }]))

    let areaAtual = { ax: 0, ay: 0 }
    for (const o of draft.objetos) {
      if (o.classe === 'area') { areaAtual = areas.get(o.nome)!; continue }
      const tx = Math.floor((o.x + o.width / 2) / GRADE.tileSize)
      const ty = Math.floor((o.y + o.height / 2) / GRADE.tileSize)
      expect(tx, o.nome).toBeGreaterThanOrEqual(areaAtual.ax)
      expect(tx, o.nome).toBeLessThan(areaAtual.ax + GRADE.areaWidth)
      expect(ty, o.nome).toBeGreaterThanOrEqual(areaAtual.ay)
      expect(ty, o.nome).toBeLessThan(areaAtual.ay + GRADE.areaHeight)
      if (o.classe === 'spawn') continue
      const i = ty * GRADE.width + tx
      expect(draft.blocked[i], `${o.nome} em tile bloqueado`).toBe(false)
      expect(draft.detail[i], `${o.nome} em cima de um prop`).toBeNull()
      // Copa desenha acima do jogador: um Centro debaixo de uma árvore é invisível no jogo.
      expect(draft.canopy[i], `${o.nome} escondido sob a copa`).toBeNull()
    }
  })

  it('acha tile livre fora da linha de partida quando ela está ocupada', () => {
    const draft = desenharRegiao(kanto, comVariacoes)
    // Prova indireta mas forte: com a varredura quebrada (só a linha y0), áreas de props densos
    // não teriam onde pôr o Centro e o gerador lançaria. Todas as oito áreas têm os três objetos.
    const porArea = new Map<string, number>()
    let atual = ''
    for (const o of draft.objetos) {
      if (o.classe === 'area') { atual = o.nome; porArea.set(atual, 0); continue }
      if (o.classe === 'spawnPoint' || o.classe === 'pokecenter') porArea.set(atual, porArea.get(atual)! + 1)
    }
    expect([...porArea.values()]).toEqual(BIOMAS.map(() => 2))
  })

  it('árvore ocupa 2×2: copa em cima, tronco bloqueando embaixo', () => {
    const draft = desenharRegiao(kanto, comVariacoes)
    const copas = draft.canopy
      .map((n, i) => ({ n, i }))
      .filter((c): c is { n: string; i: number } => c.n !== null && c.n.endsWith('-x0-y0'))
    expect(copas.length).toBeGreaterThan(0)
    for (const copa of copas) {
      const abaixo = copa.i + GRADE.width
      expect(draft.canopy[copa.i + 1]).toBe(copa.n.replace('-x0-y0', '-x1-y0'))
      expect(draft.detail[abaixo]).toBe(copa.n.replace('-x0-y0', '-x0-y1'))
      expect(draft.blocked[abaixo]).toBe(true)
      expect(draft.blocked[abaixo + 1]).toBe(true)
    }
  })
})
