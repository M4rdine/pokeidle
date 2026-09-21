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
/* A ordem é a de uso: o Mapa primeiro, porque trocar de área é a decisão mais frequente de um
 * idle, e Configurações por último, porque é a mais rara. */
export const MODAL_LABELS = { mapa: 'Mapa', team: 'Time', bag: 'Mochila', pokedex: 'Pokédex', shop: 'Loja', settings: 'Configurações' } as const
/* O ícone acompanha o rótulo, nunca o substitui: símbolo sozinho vira adivinhação, e a fileira
 * do menu é justamente onde o jogador procura por nome. */
export const MODAL_ICONS = { mapa: 'mapa', team: 'time', bag: 'mochila', pokedex: 'pokedex', shop: 'loja', settings: 'configuracoes' } as const
export const MAX_TEAM_SLOTS = 6
