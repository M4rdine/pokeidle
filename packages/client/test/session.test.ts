import { describe, expect, it } from 'vitest'
import type { Me } from '../src/api/dto.js'
import { initialSession, screenFor, withMe } from '../src/state/session.js'

const me = (patch: Partial<Me['trainer']>): Me => ({ user: { id: 'u', email: 'a@a.com', role: 'player' }, trainer: { id: 't', name: 'Ash', xp: 0, gold: 0, settings: { returnHpPercent: 50, potionHpPercent: 50, capture: { ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false } }, hasStarter: false, activeHuntId: null, level: 1, xpToNext: 8, teamSlots: 3, nextUnlock: { level: 10, what: '4 vagas no time' }, ...patch } })

describe('screenFor', () => {
  it('sem sessão → auth; sem inicial → starter; sem hunt → hunts; com hunt → game', () => {
    expect(screenFor(null)).toBe('auth')
    expect(screenFor(me({}))).toBe('starter')
    expect(screenFor(me({ hasStarter: true }))).toBe('hunts')
    expect(screenFor(me({ hasStarter: true, activeHuntId: 'route-1' }))).toBe('game')
  })
  it('initialSession começa em loading e withMe deriva a tela', () => {
    expect(initialSession().screen).toBe('loading')
    expect(withMe(initialSession(), me({ hasStarter: true })).screen).toBe('hunts')
    expect(withMe(initialSession(), null).screen).toBe('auth')
  })
})
