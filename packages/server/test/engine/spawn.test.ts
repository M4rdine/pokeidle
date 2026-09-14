import { describe, expect, it } from 'vitest'
import { createHuntState, defaultSettings } from '../../src/engine/create.js'
import { blockedAt, isWalkable, processRespawns, spawnTiles, spawnWild } from '../../src/engine/spawn.js'
import { RESPAWN_RETRY_TICKS } from '../../src/engine/constants.js'
import { baseState, charmander5, miniDeps, miniHunt } from './fixtures/mini.js'

describe('createHuntState', () => {
  it('começa no spawnPoint, searching, com os selvagens já no mapa', () => {
    const s = baseState()
    expect(s.player.position).toEqual({ x: 0, y: 0 })
    expect(s.player.mode).toBe('searching')
    expect(s.wilds).toHaveLength(1)
    expect(s.wilds[0]).toMatchObject({ speciesName: 'zubat', level: 3, position: { x: 3, y: 1 }, captureTried: false })
    expect(s.wilds[0]!.hp).toBe(s.wilds[0]!.hpMax)
    expect(s.respawns).toEqual([])
    expect(s.tick).toBe(0)
    expect(s.settings).toEqual(defaultSettings())
  })
  it('clampa returnHpPercent e maxWildHpPercent para [0, 100]', () => {
    const deps = miniDeps()
    const settings = { ...defaultSettings(), returnHpPercent: 150, capture: { ...defaultSettings().capture, maxWildHpPercent: -5 } }
    const s = createHuntState({ hunt: deps.hunt, sessionId: 'mini', team: [charmander5()], inventory: {}, settings }, deps)
    expect(s.settings.returnHpPercent).toBe(100)
    expect(s.settings.capture.maxWildHpPercent).toBe(0)
  })
})

describe('spawnTiles / blockedAt / isWalkable', () => {
  it('lista tiles do raio dentro do mapa e não bloqueados', () => {
    const hunt = miniHunt()
    expect(blockedAt(hunt, { x: 2, y: 1 })).toBe(true)
    expect(spawnTiles({ ...hunt.spawns[0]!, x: 1, y: 1, radius: 1 }, hunt).map((p) => `${p.x},${p.y}`)).toEqual(['0,0', '1,0', '2,0', '0,1', '1,1', '0,2', '1,2', '2,2'])
    const s = baseState()
    expect(isWalkable(s, hunt, { x: 3, y: 1 })).toBe(false) // selvagem
    expect(isWalkable(s, hunt, { x: 0, y: 0 })).toBe(false) // jogador
    expect(isWalkable(s, hunt, { x: 5, y: 0 })).toBe(false) // fora
    expect(isWalkable(s, hunt, { x: 1, y: 0 })).toBe(true)
  })
})

describe('spawnWild / processRespawns', () => {
  it('reagenda quando não há tile livre', () => {
    const deps = miniDeps()
    const s = baseState() // o único tile do spawn (3,1) já está ocupado
    const r = spawnWild(s, deps, 0)
    expect(r.events).toEqual([])
    expect(r.state.respawns).toEqual([{ spawnIndex: 0, atTick: RESPAWN_RETRY_TICKS }])
  })
  it('processa só os vencidos, em ordem, e emite spawned', () => {
    const deps = miniDeps()
    const empty = { ...baseState(), wilds: [], respawns: [{ spawnIndex: 0, atTick: 0 }, { spawnIndex: 0, atTick: 10 }] }
    const r = processRespawns(empty, deps)
    expect(r.state.wilds).toHaveLength(1)
    expect(r.state.respawns).toEqual([{ spawnIndex: 0, atTick: 10 }])
    expect(r.events).toEqual([{ type: 'spawned', tick: 0, wildId: 2, speciesName: 'zubat', level: 3, position: { x: 3, y: 1 } }])
    expect(r.state.nextWildId).toBe(3)
  })
  it('createHuntState com count 2 gera dois selvagens em tiles distintos quando há espaço', () => {
    const deps = miniDeps()
    const hunt = { ...deps.hunt, spawns: [{ ...deps.hunt.spawns[0]!, radius: 1, count: 2 }] }
    const s = createHuntState({ hunt, sessionId: 'mini', team: [charmander5()], inventory: {} }, { ...deps, hunt })
    expect(s.wilds).toHaveLength(2)
    expect(`${s.wilds[0]!.position.x},${s.wilds[0]!.position.y}`).not.toBe(`${s.wilds[1]!.position.x},${s.wilds[1]!.position.y}`)
  })
})
