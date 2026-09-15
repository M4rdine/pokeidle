import { nextUnlock, trainerLevel, xpForLevel, type Registry } from '@pokeidle/shared'

export interface TrainerProgressView { readonly level: number; readonly xpInto: number; readonly xpSpan: number; readonly next: { level: number; what: string } | null }

export function trainerProgress(registry: Registry, xp: number): TrainerProgressView {
  const u = registry.unlocks
  const level = trainerLevel(u, xp)
  const floor = xpForLevel(u.growthRate, level)
  return { level, xpInto: Math.max(0, xp - floor), xpSpan: xpForLevel(u.growthRate, level + 1) - floor, next: nextUnlock(u, level, registry.items) }
}

/** Textos dos destraves alcançados ao subir de `from` para `to` (para o toast "Destravou: …"). */
export function unlockedBetween(registry: Registry, from: number, to: number): string[] {
  const out: string[] = []
  let level = from
  while (level < to) { const n = nextUnlock(registry.unlocks, level, registry.items); if (!n || n.level > to) break; out.push(n.what); level = n.level }
  return out
}
