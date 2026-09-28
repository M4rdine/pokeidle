/**
 * A escolha da bola, por encontro.
 *
 * É aqui que a bola situacional rende num idle: com `ballTier: 'best'`, "melhor" deixou de ser um
 * número fixo e passou a ser "melhor NESTE ENCONTRO". O motor escolhe a Rede contra um selvagem
 * de água e a Rápida contra um que acabou de aparecer — sozinho, a cada captura, sem o jogador
 * estar na tela.
 *
 * Antes, ele comparava `ballBonus` e mais nada: depois da Ultra Bola, nenhuma outra era usada
 * nunca mais, e comprar a melhor transformava o resto da prateleira em lixo.
 */
import { loadRegistry } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { selectBall } from '../../src/engine/combat.js'
import { defaultSettings } from '../../src/engine/create.js'
import type { HuntState, WildState } from '../../src/engine/types.js'

const registry = loadRegistry()

const selvagem = (nome: string, level: number, fracaoHp = 1): WildState => {
  const hpMax = 100
  return { id: 1, spawnIndex: 0, speciesName: nome, level, hp: Math.ceil(hpMax * fracaoHp), hpMax, position: { x: 0, y: 0 }, cooldowns: {}, captureTried: false }
}

const estado = (inventory: Record<string, number>, seen: readonly string[] = []): HuntState => ({
  huntId: 'x', sessionId: 'bola', tick: 0,
  player: { team: [], activeIndex: 0, position: { x: 0, y: 0 }, path: [], mode: 'fighting', targetWildId: 1, healingUntilTick: null, cooldowns: {}, skippedWildIds: [] },
  wilds: [], box: [], respawns: [], nextWildId: 2,
  trainer: { xp: 0, gold: 0 }, inventory,
  settings: { ...defaultSettings(), seen },
})

/** Bolsa completa: é com tudo na mão que a escolha do motor fica visível. */
const BOLSA = { 'poke-ball': 9, 'great-ball': 9, 'ultra-ball': 9, 'quick-ball': 9, 'net-ball': 9, 'nest-ball': 9, 'repeat-ball': 9 }

describe('a bola da vez', () => {
  it('contra um selvagem INTACTO, escolhe a Rápida — mesmo tendo Ultra na bolsa', () => {
    expect(selectBall(estado(BOLSA), registry, selvagem('pikachu', 30))?.id).toBe('quick-ball')
  })

  it('contra um selvagem de ÁGUA já golpeado, escolhe a Rede', () => {
    // Já golpeado tira a Rápida da disputa, e é aí que a situação da Rede aparece.
    expect(selectBall(estado(BOLSA), registry, selvagem('horsea', 30, 0.5))?.id).toBe('net-ball')
  })

  it('contra um selvagem de NÍVEL BAIXO já golpeado, escolhe a Ninho', () => {
    expect(selectBall(estado(BOLSA), registry, selvagem('pikachu', 2, 0.5))?.id).toBe('nest-ball')
  })

  it('contra quem JÁ ESTÁ NA POKÉDEX, escolhe a Repetida', () => {
    const s = estado(BOLSA, ['snorlax'])
    expect(selectBall(s, registry, selvagem('snorlax', 40, 0.5))?.id).toBe('repeat-ball')
  })

  it('sem situação nenhuma que valha, cai na Ultra — o maior bônus de chão', () => {
    expect(selectBall(estado(BOLSA), registry, selvagem('snorlax', 60, 0.5))?.id).toBe('ultra-ball')
  })

  it('a Master ganha de todas, sempre', () => {
    const s = estado({ ...BOLSA, 'master-ball': 1 })
    expect(selectBall(s, registry, selvagem('pikachu', 2))?.id).toBe('master-ball')
  })

  it('com o tier fixado, a escolha do jogador manda — a situação não atropela', () => {
    // `ballTier` é ajuste do jogador. Se a situação vencesse aqui, o ajuste viraria enfeite.
    const s = { ...estado(BOLSA), settings: { ...defaultSettings(), capture: { ...defaultSettings().capture, ballTier: 'poke' as const } } }
    expect(selectBall(s, registry, selvagem('pikachu', 2))?.id).toBe('poke-ball')
  })

  it('sem selvagem em mãos, compara o chão de cada uma', () => {
    // A loja e a tela de áreas perguntam pela melhor bola fora de combate: ali não há contexto, e
    // a resposta certa é a comparação antiga.
    expect(selectBall(estado(BOLSA), registry)?.id).toBe('ultra-ball')
  })
})
