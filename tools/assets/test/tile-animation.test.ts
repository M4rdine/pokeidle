import { describe, expect, it } from 'vitest'
import { isPhaseFrame, phaseFrameName, phaseFrameNames } from '../src/tile-animation.js'

describe('phaseFrameName', () => {
  it('mantém o nome simples na fase 0 e sufixa as demais', () => {
    expect(phaseFrameName('water', 0)).toBe('water')
    expect(phaseFrameName('water', 3)).toBe('water_3')
  })
})

describe('phaseFrameNames', () => {
  it('lista os quadros em ordem de fase, começando pelo nome simples', () => {
    expect(phaseFrameNames('water', 3)).toEqual(['water', 'water_1', 'water_2'])
  })
  it('um tile de fase única devolve só o nome simples', () => {
    expect(phaseFrameNames('grass', 1)).toEqual(['grass'])
  })
})

describe('isPhaseFrame', () => {
  it('reconhece quadro de fase e não confunde com peça fatiada nem com transição', () => {
    expect(isPhaseFrame('water_2')).toBe(true)
    expect(isPhaseFrame('water')).toBe(false)
    expect(isPhaseFrame('tree-oak-x0-y1')).toBe(false)
    expect(isPhaseFrame('grama-terra-baaa')).toBe(false)
  })
})
