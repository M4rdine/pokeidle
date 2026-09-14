import type { HuntMap, Registry, Rng } from '@pokeidle/shared'

export interface Point { readonly x: number; readonly y: number }
export type PlayerMode = 'searching' | 'walking' | 'fighting' | 'returning' | 'healing' | 'stopped'
export type BallTier = 'poke' | 'great' | 'ultra' | 'best'

export interface PokemonState {
  readonly id: string; readonly speciesName: string; readonly level: number
  readonly xp: number; readonly hp: number; readonly hpMax: number
}
export interface WildState {
  readonly id: number; readonly spawnIndex: number; readonly speciesName: string; readonly level: number
  readonly hp: number; readonly hpMax: number; readonly position: Point
  readonly cooldowns: Readonly<Record<string, number>>; readonly captureTried: boolean
}
export interface CaptureSettings { readonly ballTier: BallTier; readonly maxWildHpPercent: number; readonly allowDuplicates: boolean }
export interface HuntSettings { readonly returnHpPercent: number; readonly capture: CaptureSettings; readonly seen: readonly string[] }
export interface PlayerState {
  readonly team: readonly PokemonState[]; readonly activeIndex: number
  readonly position: Point; readonly path: readonly Point[]
  readonly mode: PlayerMode; readonly targetWildId: number | null; readonly healingUntilTick: number | null
  readonly cooldowns: Readonly<Record<string, number>>
  readonly skippedWildIds: readonly number[]
}
export interface Respawn { readonly spawnIndex: number; readonly atTick: number }
export interface HuntState {
  readonly huntId: string; readonly tick: number
  readonly player: PlayerState
  readonly wilds: readonly WildState[]
  readonly respawns: readonly Respawn[]
  readonly nextWildId: number
  readonly trainer: { readonly xp: number; readonly gold: number }
  readonly inventory: Readonly<Record<string, number>>
  readonly settings: HuntSettings
}
export interface EngineDeps { readonly registry: Registry; readonly hunt: HuntMap; readonly rng: Rng }

export type Event =
  | { type: 'spawned'; tick: number; wildId: number; speciesName: string; level: number; position: Point }
  | { type: 'moved'; tick: number; from: Point; to: Point }
  | { type: 'attack'; tick: number; attacker: 'player' | 'wild'; attackerId: string; targetId: string; move: string; damage: number; targetHp: number }
  | { type: 'wildDefeated'; tick: number; wildId: number; speciesName: string; level: number; xpTrainer: number; xpPokemon: number; gold: number; drops: readonly { item: string; quantity: number }[] }
  | { type: 'captured'; tick: number; wildId: number; speciesName: string; level: number; ball: string; toBox: boolean }
  | { type: 'captureFailed'; tick: number; wildId: number; ball: string }
  | { type: 'pokemonFainted'; tick: number; pokemonId: string }
  | { type: 'switched'; tick: number; pokemonId: string }
  | { type: 'levelUp'; tick: number; pokemonId: string; level: number }
  | { type: 'evolved'; tick: number; pokemonId: string; from: string; to: string }
  | { type: 'itemUsed'; tick: number; itemId: string; pokemonId: string; hp: number }
  | { type: 'returning'; tick: number }
  | { type: 'healed'; tick: number }
  | { type: 'stopped'; tick: number; reason: 'team-fainted' | 'intent' | 'no-route' }
  | { type: 'skipped'; tick: number; wildId: number }

export type Intent =
  | { type: 'stop' }
  | { type: 'useItem'; itemId: string }
  | { type: 'setActive'; pokemonId: string }
  | { type: 'updateSettings'; patch: Partial<{ returnHpPercent: number; capture: Partial<CaptureSettings> }> }

export interface StepResult { readonly state: HuntState; readonly events: readonly Event[] }
export interface EngineError { readonly code: string; readonly message: string }
export type IntentResult = StepResult | { readonly error: EngineError }
