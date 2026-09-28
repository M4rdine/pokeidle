/**
 * A varrida precisa distinguir SUJEIRA de CENÁRIO, e o preço de errar é assimétrico: deixar poça
 * passar suja o mapa, mas varrer parede o esburaca. Por isso cada caso aqui nomeia uma coisa real
 * do dump, e não uma combinação de booleanos.
 */
import { describe, expect, it } from 'vitest'
import { ehSujeira, type ItemJulgavel } from '../src/sujeira.js'

const item = (partes: Partial<ItemJulgavel>): ItemJulgavel => ({
  id: 9999, phases: 1, isGround: false, isBlocking: false, isSplash: false,
  isCorpse: false, isContainer: false, isNotPathable: false, hasLight: false, ...partes,
})

describe('ehSujeira', () => {
  it('varre a poça, que é o que o servidor derrama e o tempo apaga', () => {
    expect(ehSujeira(item({ isSplash: true }))).toBe(true)
  })

  it('varre o corpo caído marcado como tal', () => {
    expect(ehSujeira(item({ isCorpse: true }))).toBe(true)
  })

  it('varre o cadáver de bicho grande, que só se declara CONTAINER', () => {
    expect(ehSujeira(item({ isContainer: true }))).toBe(true)
  })

  it('não varre baú nem barril: container que BARRA PASSAGEM é cenário', () => {
    expect(ehSujeira(item({ isContainer: true, isBlocking: true }))).toBe(false)
  })

  it('varre o campo mágico — anima, acende e barra rota sem barrar passagem', () => {
    expect(ehSujeira(item({ phases: 4, hasLight: true, isNotPathable: true }))).toBe(true)
  })

  it('não varre a tocha de parede, que acende mas não barra rota', () => {
    expect(ehSujeira(item({ phases: 2, hasLight: true }))).toBe(false)
  })

  it('não varre chão, nem quando ele acende', () => {
    expect(ehSujeira(item({ isGround: true, phases: 2, hasLight: true, isNotPathable: true }))).toBe(false)
  })

  it('não varre parede, árvore nem pedra', () => {
    expect(ehSujeira(item({ isBlocking: true }))).toBe(false)
    expect(ehSujeira(item({ isGround: true, isBlocking: true }))).toBe(false)
  })

  it('varre por id o cadáver que o autor do mapa pôs como cenário, que bandeira nenhuma denuncia', () => {
    expect(ehSujeira(item({ id: 3204 }))).toBe(true)
    expect(ehSujeira(item({ id: 3205 }))).toBe(false)
  })
})
