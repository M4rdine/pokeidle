import type { Item } from './schemas/items.js'
import type { Unlocks } from './schemas/unlocks.js'
import { levelFromXp, xpForLevel } from './xp.js'

export const trainerLevel = (u: Unlocks, xp: number): number => levelFromXp(u.growthRate, xp)

export const xpToNextLevel = (u: Unlocks, xp: number): number => xpForLevel(u.growthRate, trainerLevel(u, xp) + 1) - xp

export const teamSlotsFor = (u: Unlocks, level: number): number =>
  u.teamSlots.filter((s) => s.level <= level).reduce((best, s) => Math.max(best, s.slots), 1)

export const itemUnlockLevel = (u: Unlocks, itemId: string): number => u.items[itemId] ?? 0

export const regionUnlockLevel = (u: Unlocks, regionId: string): number => u.regions[regionId] ?? 0

export function nextUnlock(u: Unlocks, level: number, items: ReadonlyMap<string, Item>): { level: number; what: string } | null {
  const levels = [...u.teamSlots.map((s) => s.level), ...Object.values(u.items), ...Object.values(u.regions)].filter((l) => l > level)
  if (levels.length === 0) return null
  const next = Math.min(...levels)
  const parts = [
    ...Object.entries(u.items).filter(([, l]) => l === next).map(([id]) => items.get(id)?.name ?? id),
    ...u.teamSlots.filter((s) => s.level === next).map((s) => `${s.slots} vagas no time`),
    ...Object.entries(u.regions).filter(([, l]) => l === next).map(([id]) => `região ${id}`),
  ]
  return { level: next, what: parts.join(', ') }
}
