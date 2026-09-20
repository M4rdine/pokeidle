/**
 * O registro completo, com os mapas das áreas. Vive num módulo próprio para que o bundle do
 * cliente — que só chama `loadContentRegistry` — não arraste centenas de kB de camadas de tile
 * por causa de um import estático que ele nunca usa.
 */
import { rawData } from './data-files.js'
import { buildRegistry, type Registry } from './registry.js'

let cached: Registry | undefined
export function loadRegistry(): Registry {
  cached ??= buildRegistry(rawData)
  return cached
}
