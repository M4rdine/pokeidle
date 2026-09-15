import { activePokemon, type HuntView } from '../state/hunt-view.js'

export interface Entity {
  readonly id: string
  readonly kind: 'player' | 'wild'
  readonly speciesName: string
  readonly level: number
  readonly x: number
  readonly y: number
  readonly hp: number
  readonly hpMax: number
  readonly targeted: boolean
  readonly fainted: boolean
}
export type Entities = Readonly<Record<string, Entity>>
export type Op =
  | { readonly op: 'create'; readonly entity: Entity }
  | { readonly op: 'update'; readonly entity: Entity; readonly prev: Entity }
  | { readonly op: 'remove'; readonly id: string }

export function entitiesOf(view: HuntView): Entities {
  const s = view.state
  const active = activePokemon(view)
  if (!s || !active) return {}
  const player: Entity = { id: 'player', kind: 'player', speciesName: active.speciesName, level: active.level, x: s.player.position.x, y: s.player.position.y, hp: active.hp, hpMax: active.hpMax, targeted: false, fainted: active.hp <= 0 }
  const wilds = s.wilds.map((w): Entity => ({ id: `wild:${w.id}`, kind: 'wild', speciesName: w.speciesName, level: w.level, x: w.position.x, y: w.position.y, hp: w.hp, hpMax: w.hpMax, targeted: w.id === view.derived.targetWildId, fainted: w.hp <= 0 }))
  return Object.fromEntries([player, ...wilds].map((e) => [e.id, e]))
}

const same = (a: Entity, b: Entity): boolean => (Object.keys(a) as (keyof Entity)[]).every((k) => a[k] === b[k])

export function reconcile(prev: Entities, next: Entities): Op[] {
  const removes: Op[] = Object.keys(prev)
    .filter((id) => !(id in next))
    .map((id) => ({ op: 'remove', id }))
  const creates: Op[] = Object.values(next)
    .filter((e) => !(e.id in prev))
    .map((entity) => ({ op: 'create', entity }))
  const updates: Op[] = Object.values(next)
    .filter((e) => e.id in prev && !same(prev[e.id]!, e))
    .map((entity) => ({ op: 'update', entity, prev: prev[entity.id]! }))
  return [...removes, ...creates, ...updates]
}
