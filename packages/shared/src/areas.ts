/**
 * Portão de nível das áreas. A região tem um nível mínimo e cada área tem o seu; vale o maior
 * dos dois. Sem isso um treinador de nível 1 entra na caverna de nível 28 e perde o time inteiro
 * antes de entender o que aconteceu.
 */
import type { Area, Region } from './schemas/region.js'
import type { Unlocks } from './schemas/unlocks.js'
import { regionUnlockLevel } from './unlocks.js'

export interface AreaLocation {
  readonly region: Region
  readonly area: Area
}

export function findArea(regions: ReadonlyMap<string, Region>, areaId: string): AreaLocation | null {
  for (const region of regions.values()) {
    const area = region.areas.find((a) => a.id === areaId)
    if (area) return { region, area }
  }
  return null
}

interface GateInput {
  readonly regions: ReadonlyMap<string, Region>
  readonly unlocks: Unlocks
}

/** Nível de treinador exigido para entrar. Área desconhecida devolve 0: quem barra é o 404. */
export function areaUnlockLevel(registry: GateInput, areaId: string): number {
  const achado = findArea(registry.regions, areaId)
  if (!achado) return 0
  return Math.max(regionUnlockLevel(registry.unlocks, achado.region.id), achado.area.minTrainerLevel)
}

export const canEnterArea = (registry: GateInput, areaId: string, trainerLevel: number): boolean =>
  trainerLevel >= areaUnlockLevel(registry, areaId)
