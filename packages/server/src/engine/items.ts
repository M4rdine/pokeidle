import { evolutionByItem, hpAt, type Item, type Registry } from '@pokeidle/shared'
import type { EngineError, HuntState, PokemonState, StepResult } from './types.js'

type Potion = Item & { kind: 'potion' }
const healAmount = (p: Potion, hpMax: number): number => Math.ceil((hpMax * p.healPercent) / 100)

/** A mais fraca que cobre o HP faltante; se nenhuma cobre, a mais forte; sem poção, null. */
export function choosePotion(state: HuntState, registry: Registry, active: PokemonState): Potion | null {
  const owned = [...registry.items.values()].filter((i): i is Potion => i.kind === 'potion' && (state.inventory[i.id] ?? 0) > 0)
  if (owned.length === 0) return null
  const missing = active.hpMax - active.hp
  const sorted = [...owned].sort((a, b) => a.healPercent - b.healPercent)
  return sorted.find((p) => healAmount(p, active.hpMax) >= missing) ?? sorted[sorted.length - 1]!
}

type Reviver = Item & { kind: 'revive' }

/**
 * O Reviver mais FRACO que resolve — e aqui "resolver" é sempre, porque qualquer um tira o
 * Pokémon de zero. A mesma regra da poção: gastar o caro quando o barato serve é o erro que o
 * jogador não vê acontecer, porque ele está fora da tela quando acontece.
 */
export function chooseRevive(state: HuntState, registry: Registry): Reviver | null {
  const owned = [...registry.items.values()].filter((i): i is Reviver => i.kind === 'revive' && (state.inventory[i.id] ?? 0) > 0)
  return [...owned].sort((a, b) => a.healPercent - b.healPercent)[0] ?? null
}

const fail = (code: string, message: string): { error: EngineError } => ({ error: { code, message } })

/**
 * A PEDRA evolui um Pokémon do time — não necessariamente o que está em campo.
 *
 * O HP é reescalado, não copiado nem zerado: a evolução aumenta o HP máximo, e manter o valor
 * absoluto faria o Raichu nascer proporcionalmente mais ferido que o Pikachu que ele era. É a
 * mesma conta que a evolução por nível já faz.
 *
 * A pedra errada NÃO É GASTA, e isso é contrato: `evolutionByItem` devolve `undefined` quando a
 * espécie não pede aquele item, e o jogador não pode perder cinco mil de ouro por clicar na
 * pedra errada.
 */
export function applyStone(state: HuntState, registry: Registry, itemId: string, pokemonId: string | undefined): StepResult | { error: EngineError } {
  const item = registry.items.get(itemId)
  if (!item || item.kind !== 'stone') return fail('not-a-stone', `${itemId} não é uma pedra`)
  if ((state.inventory[itemId] ?? 0) <= 0) return fail('out-of-stock', `sem ${itemId} no inventário`)
  const index = pokemonId === undefined
    ? state.player.activeIndex
    : state.player.team.findIndex((p) => p.id === pokemonId)
  const alvo = state.player.team[index]
  if (!alvo) return fail('unknown-pokemon', `${pokemonId ?? 'ativo'} não está no time`)
  const especie = registry.species.get(alvo.speciesName)
  if (!especie) return fail('unknown-species', `${alvo.speciesName} não existe no registro`)
  const destino = evolutionByItem(especie, itemId, registry)
  if (!destino) return fail('wrong-stone', `${item.name} não evolui ${alvo.speciesName}`)

  const hpMax = hpAt(destino.baseStats.hp, alvo.level)
  const hp = Math.max(1, Math.round((alvo.hp / alvo.hpMax) * hpMax))
  const team = state.player.team.map((p, i) => (i === index ? { ...p, speciesName: destino.name, hp, hpMax } : p))
  return {
    state: {
      ...state,
      inventory: { ...state.inventory, [itemId]: (state.inventory[itemId] ?? 0) - 1 },
      player: { ...state.player, team },
    },
    events: [{ type: 'evolved', tick: state.tick, pokemonId: alvo.id, from: especie.name, to: destino.name }],
  }
}

export function applyPotion(state: HuntState, registry: Registry, itemId: string): StepResult | { error: EngineError } {
  const item = registry.items.get(itemId)
  if (!item) return fail('unknown-item', `item ${itemId} não existe`)
  if (item.kind !== 'potion') return fail('not-a-potion', `${itemId} não é poção`)
  if ((state.inventory[itemId] ?? 0) <= 0) return fail('out-of-stock', `sem ${itemId} no inventário`)
  const active = state.player.team[state.player.activeIndex]
  if (!active) return fail('no-active', 'sem Pokémon ativo')
  if (active.hp >= active.hpMax) return fail('full-hp', 'HP já está cheio')
  const hp = Math.min(active.hpMax, active.hp + Math.ceil((active.hpMax * item.healPercent) / 100))
  const team = state.player.team.map((p, i) => (i === state.player.activeIndex ? { ...p, hp } : p))
  return {
    state: { ...state, inventory: { ...state.inventory, [itemId]: (state.inventory[itemId] ?? 0) - 1 }, player: { ...state.player, team } },
    events: [{ type: 'itemUsed', tick: state.tick, itemId, pokemonId: active.id, hp }],
  }
}
