import type { HuntMap } from '@pokeidle/shared'
import { CAPTURE_MAX_WILD_HP_DEFAULT, RETURN_HP_PERCENT_DEFAULT } from './constants.js'
import { processRespawns } from './spawn.js'
import type { EngineDeps, HuntSettings, HuntState, PokemonState } from './types.js'

export const defaultSettings = (seen: readonly string[] = []): HuntSettings => ({
  returnHpPercent: RETURN_HP_PERCENT_DEFAULT,
  capture: { ballTier: 'best', maxWildHpPercent: CAPTURE_MAX_WILD_HP_DEFAULT, allowDuplicates: false },
  seen,
})

export interface CreateInput {
  readonly hunt: HuntMap
  readonly team: readonly PokemonState[]
  readonly inventory: Readonly<Record<string, number>>
  readonly settings?: HuntSettings
}

export function createHuntState(input: CreateInput, deps: EngineDeps): HuntState {
  if (input.team.length === 0) throw new Error('time vazio')
  const respawns = input.hunt.spawns.flatMap((s, spawnIndex) => Array.from({ length: s.count }, () => ({ spawnIndex, atTick: 0 })))
  const initial: HuntState = {
    huntId: input.hunt.id, tick: 0,
    player: { team: input.team, activeIndex: 0, position: input.hunt.spawnPoint, path: [], mode: 'searching', targetWildId: null, healingUntilTick: null, cooldowns: {}, skippedWildIds: [] },
    wilds: [], respawns, nextWildId: 1,
    trainer: { xp: 0, gold: 0 },
    inventory: input.inventory,
    settings: input.settings ?? defaultSettings(),
  }
  return processRespawns(initial, deps).state
}
