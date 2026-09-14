import type { Registry } from './registry.js'
import type { Species } from './schemas/species.js'

export function nextEvolution(species: Species, level: number, registry: Pick<Registry, 'species'>): Species | undefined {
  const evo = species.evolvesTo
  if (!evo || level < evo.level) return undefined
  const target = registry.species.get(evo.species)
  if (!target) throw new Error(`espécie ${species.name}: evolução ${evo.species} não existe no registro`)
  return target
}
