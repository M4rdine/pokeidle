import { applyPotion, applyStone } from './items.js'
import type { CaptureSettings, EngineDeps, EngineError, HuntState, Intent, IntentResult } from './types.js'

const fail = (code: string, message: string): { error: EngineError } => ({ error: { code, message } })
const TIERS = ['poke', 'great', 'ultra', 'best'] as const
const inRange = (v: number | undefined): boolean => v === undefined || (Number.isFinite(v) && v >= 0 && v <= 100)

function stop(state: HuntState): IntentResult {
  if (state.player.mode === 'stopped') return fail('already-stopped', 'a hunt já está parada')
  return { state: { ...state, player: { ...state.player, mode: 'stopped', targetWildId: null, path: [] } }, events: [{ type: 'stopped', tick: state.tick, reason: 'intent' }] }
}

function setActive(state: HuntState, pokemonId: string): IntentResult {
  const index = state.player.team.findIndex((p) => p.id === pokemonId)
  if (index === -1) return fail('unknown-pokemon', `${pokemonId} não está no time`)
  if (state.player.team[index]!.hp <= 0) return fail('fainted', `${pokemonId} está sem HP`)
  if (index === state.player.activeIndex) return fail('already-active', `${pokemonId} já é o ativo`)
  return { state: { ...state, player: { ...state.player, activeIndex: index, cooldowns: {}, skippedWildIds: [] } }, events: [{ type: 'switched', tick: state.tick, pokemonId }] }
}

function updateSettings(state: HuntState, patch: Extract<Intent, { type: 'updateSettings' }>['patch']): IntentResult {
  const capture: CaptureSettings = { ...state.settings.capture, ...(patch.capture ?? {}) }
  if (!inRange(patch.returnHpPercent) || !inRange(patch.potionHpPercent) || !inRange(capture.maxWildHpPercent) || !TIERS.includes(capture.ballTier)) {
    return fail('invalid-settings', 'percentuais devem estar em [0, 100] e ballTier em poke|great|ultra|best')
  }
  return {
    state: {
      ...state,
      settings: {
        ...state.settings,
        returnHpPercent: patch.returnHpPercent ?? state.settings.returnHpPercent,
        potionHpPercent: patch.potionHpPercent ?? state.settings.potionHpPercent,
        capture,
      },
    },
    events: [],
  }
}

export function applyIntent(state: HuntState, intent: Intent, deps: EngineDeps): IntentResult {
  switch (intent.type) {
    case 'stop': return stop(state)
    /*
     * O TIPO DO ITEM decide o que usar faz — não um segundo intent. Um `stone.use` ao lado de um
     * `item.use` obrigaria o cliente a saber a taxonomia do registro para mandar a mensagem
     * certa, e ele já sabe menos que o servidor sobre isso.
     */
    case 'useItem': {
      const item = deps.registry.items.get(intent.itemId)
      if (item?.kind === 'stone') return applyStone(state, deps.registry, intent.itemId, intent.pokemonId)
      return applyPotion(state, deps.registry, intent.itemId)
    }
    case 'setActive': return setActive(state, intent.pokemonId)
    case 'updateSettings': return updateSettings(state, intent.patch)
  }
}
