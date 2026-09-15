import { describe, expect, it } from 'vitest'
import type { HuntState, ServerMessage } from '@pokeidle/shared/protocol'
import { applySnapshot, emptyHuntView } from '../../src/state/hunt-view.js'
import { entitiesOf, reconcile, type Entity } from '../../src/scene/reconcile.js'
import fixture from '../fixtures/route1-300.json' with { type: 'json' }

const snap = (fixture as { snapshot: Extract<ServerMessage, { t: 'hunt.snapshot' }> }).snapshot
const view = applySnapshot(emptyHuntView(), snap)
const e = (patch: Partial<Entity>): Entity => ({ id: 'player', kind: 'player', speciesName: 'charmander', level: 10, x: 0, y: 0, hp: 10, hpMax: 10, targeted: false, fainted: false, ...patch })

describe('entitiesOf', () => {
  it('mapeia o ativo em player e cada selvagem em wild:<id>, marcando o alvo', () => {
    const ents = entitiesOf({ ...view, derived: { ...view.derived, targetWildId: snap.state.wilds[0]!.id } })
    expect(ents['player']).toMatchObject({ kind: 'player', speciesName: 'charmander', x: snap.state.player.position.x, y: snap.state.player.position.y })
    expect(Object.keys(ents)).toHaveLength(1 + snap.state.wilds.length)
    expect(ents[`wild:${snap.state.wilds[0]!.id}`]).toMatchObject({ kind: 'wild', targeted: true, level: snap.state.wilds[0]!.level })
    expect(entitiesOf(emptyHuntView())).toEqual({})
  })
})
describe('reconcile', () => {
  it('gera remove, create e update por id, e nada quando nada mudou', () => {
    const prev = { player: e({}), 'wild:1': e({ id: 'wild:1', kind: 'wild', x: 3 }) }
    const next = { player: e({ x: 1 }), 'wild:2': e({ id: 'wild:2', kind: 'wild', x: 5 }) }
    expect(reconcile(prev, next)).toEqual([
      { op: 'remove', id: 'wild:1' },
      { op: 'create', entity: next['wild:2'] },
      { op: 'update', entity: next['player'], prev: prev['player'] },
    ])
    expect(reconcile(prev, { ...prev })).toEqual([])
    const sameValues = { player: e({}), 'wild:1': e({ id: 'wild:1', kind: 'wild', x: 3 }) }
    expect(reconcile(prev, sameValues)).toEqual([]) // igualdade por valor, não por referência
  })
})
