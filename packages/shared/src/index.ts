export const TICK_MS = 200
/**
 * O máximo que o servidor simula de uma vez ao recuperar tempo offline: doze horas (216 000 ticks
 * a 200 ms). Mora aqui, e não no servidor, porque os dois lados precisam do mesmo número por
 * motivos diferentes — o servidor para IMPOR o teto, o cliente para EXPLICAR que ele existe no
 * painel de volta. Duplicado, um dos dois envelheceria calado.
 */
export const MAX_CATCHUP_TICKS = 216_000
export { createRng, type Rng } from './rng.js'
export { parseOrThrow } from './parse-or-throw.js'
export * from './schemas/type-chart.js'
export * from './schemas/species.js'
export * from './schemas/moves.js'
export * from './schemas/items.js'
export * from './schemas/loot.js'
export * from './schemas/hunt-map.js'
export * from './schemas/unlocks.js'
export * from './schemas/region.js'
export {
  buildContentRegistry, buildRegistry, loadContentRegistry,
  type ContentRegistry, type RawContent, type RawRegistry, type Registry,
} from './registry.js'
export { loadRegistry } from './registry-full.js'
export * from './stats.js'
export * from './xp.js'
export * from './unlocks.js'
export * from './moves.js'
export * from './damage.js'
export * from './capture.js'
export * from './evolution.js'
export * from './loot.js'
export * from './analyzer.js'
export * from './areas.js'
