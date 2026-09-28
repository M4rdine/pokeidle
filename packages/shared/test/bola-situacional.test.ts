/**
 * As bolas situacionais: o bônus deixa de ser um número fixo e passa a depender do encontro.
 *
 * Com um eixo só, a melhor bola sempre ganha e as outras viram lixo — comprar Ultra torna Great e
 * Poké itens que ninguém mais toca. A bola situacional quebra isso porque o valor dela depende do
 * que está na frente: a Rápida vale no selvagem intacto, a Rede contra água e inseto, a Ninho
 * contra nível baixo, a Repetida contra quem já está na Pokédex.
 *
 * E num idle isso rende duas vezes: o motor escolhe sozinho, a cada encontro, a bola cujo bônus é
 * o maior NAQUELE contexto — que é a decisão que o jogador não está lá para tomar.
 */
import { describe, expect, it } from 'vitest'
import { loadRegistry } from '../src/registry-full.js'
import { bonusDaBola, type ContextoDeCaptura } from '../src/capture.js'

const registry = loadRegistry()
const bola = (id: string) => {
  const i = registry.items.get(id)
  if (!i || i.kind !== 'ball') throw new Error(`${id} não é bola`)
  return i
}

const ctx = (over: Partial<ContextoDeCaptura> = {}): ContextoDeCaptura => ({
  intacto: false, tipos: ['normal'], nivel: 30, jaNaPokedex: false, ...over,
})

describe('bônus por situação', () => {
  it('a Poké Bola é o chão e não tem situação: sempre o mesmo bônus', () => {
    expect(bonusDaBola(bola('poke-ball'), ctx({ intacto: true }))).toBe(1)
    expect(bonusDaBola(bola('poke-ball'), ctx({ nivel: 2 }))).toBe(1)
  })

  it('a Rápida vale no selvagem INTACTO, e vira chão depois do primeiro golpe', () => {
    expect(bonusDaBola(bola('quick-ball'), ctx({ intacto: true }))).toBeGreaterThan(2)
    expect(bonusDaBola(bola('quick-ball'), ctx({ intacto: false }))).toBe(1)
  })

  it('a Rede vale contra água e inseto, e só', () => {
    expect(bonusDaBola(bola('net-ball'), ctx({ tipos: ['water'] }))).toBeGreaterThan(2)
    expect(bonusDaBola(bola('net-ball'), ctx({ tipos: ['bug', 'flying'] }))).toBeGreaterThan(2)
    expect(bonusDaBola(bola('net-ball'), ctx({ tipos: ['fire'] }))).toBe(1)
  })

  it('a Ninho vale contra nível baixo e apaga conforme o nível sobe', () => {
    const baixo = bonusDaBola(bola('nest-ball'), ctx({ nivel: 2 }))
    const medio = bonusDaBola(bola('nest-ball'), ctx({ nivel: 15 }))
    expect(baixo).toBeGreaterThan(medio)
    expect(medio).toBeGreaterThan(1)
    // Acima do teto ela não é pior que a Poké Bola: bônus nunca desce abaixo do chão.
    expect(bonusDaBola(bola('nest-ball'), ctx({ nivel: 90 }))).toBe(1)
  })

  it('a Repetida vale em quem já está na Pokédex', () => {
    expect(bonusDaBola(bola('repeat-ball'), ctx({ jaNaPokedex: true }))).toBeGreaterThan(2)
    expect(bonusDaBola(bola('repeat-ball'), ctx({ jaNaPokedex: false }))).toBe(1)
  })

  it('a Master não tem situação: ela é grande o bastante para a conta saturar', () => {
    // Sem caso especial no motor. A fórmula já satura em 1, então um bônus enorme É "sempre pega".
    expect(bonusDaBola(bola('master-ball'), ctx())).toBeGreaterThanOrEqual(255)
  })

  it('as bolas fixas continuam fixas', () => {
    expect(bonusDaBola(bola('great-ball'), ctx({ intacto: true, nivel: 2 }))).toBe(1.5)
    expect(bonusDaBola(bola('ultra-ball'), ctx({ jaNaPokedex: true }))).toBe(2)
  })
})
