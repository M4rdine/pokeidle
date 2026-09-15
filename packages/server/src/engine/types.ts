import type { HuntMap, Registry, Rng } from '@pokeidle/shared'
import type { CaptureSettings, Event, HuntState } from '@pokeidle/shared/protocol'

export type { Point, PlayerMode, BallTier, PokemonState, WildState, CaptureSettings, HuntSettings, PlayerState, Respawn, HuntState, Event } from '@pokeidle/shared/protocol'

export interface EngineDeps { readonly registry: Registry; readonly hunt: HuntMap; readonly rng: Rng }

export type Intent =
  | { type: 'stop' }
  | { type: 'useItem'; itemId: string }
  | { type: 'setActive'; pokemonId: string }
  | { type: 'updateSettings'; patch: Partial<{ returnHpPercent: number; capture: Partial<CaptureSettings> }> }

export interface StepResult { readonly state: HuntState; readonly events: readonly Event[] }
export interface EngineError { readonly code: string; readonly message: string }
export type IntentResult = StepResult | { readonly error: EngineError }
