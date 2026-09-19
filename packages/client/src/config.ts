export { TICK_MS, TILE_SIZE } from '@pokeidle/shared'
export const ATLAS_URL = { pokemon: '/assets/atlas/pokemon.json', tiles: '/assets/atlas/tiles.json' } as const
export const WS_PATH = '/ws'
export const LOG_MAX_LINES = 200
/** Tempo de cada fase de um tile animado. Todos compartilham o mesmo relógio, para a água pulsar junta. */
export const TILE_ANIMATION_MS = 500
export const INTENT_MIN_INTERVAL_MS = 200
export const BACKOFF_MIN_MS = 1000
export const BACKOFF_MAX_MS = 30000
export const TIP_PREFIX = 'pokeidle.tip.'
/** Nome de exibição das hunts ainda não implementadas (aparecem bloqueadas pelo nível). */
export const HUNT_NAMES: Readonly<Record<string, string>> = { 'route-1': 'Rota 1', 'route-2': 'Rota 2' }
export const MODAL_LABELS = { team: 'Time', bag: 'Mochila', settings: 'Configurações', pokedex: 'Pokédex', shop: 'Loja' } as const
export const MAX_TEAM_SLOTS = 6
