import type { Item, Registry } from '@pokeidle/shared'
import type { EngineError, HuntState, StepResult } from './types.js'

export function weakestPotion(state: HuntState, registry: Registry): Item | null {
  const potions = [...registry.items.values()].filter((i): i is Item & { kind: 'potion' } => i.kind === 'potion' && (state.inventory[i.id] ?? 0) > 0)
  return potions.reduce<(Item & { kind: 'potion' }) | null>((best, i) => (best === null || i.healPercent < best.healPercent ? i : best), null)
}

const fail = (code: string, message: string): { error: EngineError } => ({ error: { code, message } })

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
