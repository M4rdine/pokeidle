export { TICK_MS, TILE_SIZE } from '@pokeidle/shared'
export const ATLAS_URL = { pokemon: '/assets/atlas/pokemon.json', tiles: '/assets/atlas/tiles.json' } as const
export const WS_PATH = '/ws'
export const LOG_MAX_LINES = 200
export const INTENT_MIN_INTERVAL_MS = 200
export const BACKOFF_MIN_MS = 1000
export const BACKOFF_MAX_MS = 30000
export const TIP_PREFIX = 'pokeidle.tip.'
