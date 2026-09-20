import { nextUnlock, trainerLevel, xpForLevel, type ContentRegistry, type Unlocks } from '@pokeidle/shared'

export interface TrainerProgressView { readonly level: number; readonly xpInto: number; readonly xpSpan: number; readonly next: { level: number; what: string } | null }

export function trainerProgress(registry: ContentRegistry, xp: number): TrainerProgressView {
  const u = registry.unlocks
  const level = trainerLevel(u, xp)
  const floor = xpForLevel(u.growthRate, level)
  return { level, xpInto: Math.max(0, xp - floor), xpSpan: xpForLevel(u.growthRate, level + 1) - floor, next: nextUnlock(u, level, registry.items) }
}

/** Textos dos destraves alcançados ao subir de `from` para `to` (para o toast "Destravou: …"). */
export function unlockedBetween(registry: ContentRegistry, from: number, to: number): string[] {
  const out: string[] = []
  let level = from
  while (level < to) { const n = nextUnlock(registry.unlocks, level, registry.items); if (!n || n.level > to) break; out.push(n.what); level = n.level }
  return out
}

/**
 * Nível do treinador que libera a vaga de índice `index` (base zero), ou `null` quando regra
 * nenhuma chega a concedê-la.
 *
 * Existe para o slot travado dizer o que falta. Antes ele mostrava um cadeado em emoji, que é um
 * glifo fazendo papel de ícone num sistema que não tem ícone nenhum — e que, pior, não informa.
 */
export function nivelDaVaga(unlocks: Unlocks, index: number): number | null {
  const niveis = [...unlocks.teamSlots].sort((a, b) => a.level - b.level)
  // A primeira regra que já concede `index + 1` vagas é a que destrava esta: as regras são
  // cumulativas, e ler na ordem crescente dispensa confiar na ordem do arquivo.
  return niveis.find((s) => s.slots >= index + 1)?.level ?? null
}
