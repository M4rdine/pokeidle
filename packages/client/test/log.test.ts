import { loadRegistry } from '@pokeidle/shared'
import type { HuntState } from '@pokeidle/shared/protocol'
import { describe, expect, it } from 'vitest'
import { appendLog, displayName, formatEvent, stopReasonText } from '../src/state/log.js'
import fixture from './fixtures/route1-300.json' with { type: 'json' }

const registry = loadRegistry()
const state = (fixture as { snapshot: { state: HuntState } }).snapshot.state
const wild = state.wilds[0]!
const ctx = { registry, state }
const text = (e: Parameters<typeof formatEvent>[0]) => formatEvent(e, ctx)?.text

describe('formatEvent', () => {
  it('uma linha por tipo, em português, com nomes legíveis', () => {
    expect(displayName('leech-life')).toBe('Leech Life')
    expect(text({ type: 'attack', tick: 1, attacker: 'player', attackerId: 'p1', targetId: String(wild.id), move: 'ember', damage: 9, targetHp: 7 })).toBe(`Charmander usou Ember em ${displayName(wild.speciesName)}: 9 de dano`)
    expect(text({ type: 'attack', tick: 1, attacker: 'wild', attackerId: String(wild.id), targetId: 'p1', move: 'tackle', damage: 4, targetHp: 20 })).toBe(`${displayName(wild.speciesName)} usou Tackle em Charmander: 4 de dano`)
    expect(text({ type: 'wildDefeated', tick: 1, wildId: wild.id, speciesName: 'zubat', level: 4, xpTrainer: 21, xpPokemon: 21, gold: 5, drops: [{ item: 'potion', quantity: 1 }] })).toBe('Zubat L4 derrotado: +21 XP, +5 ouro, Poção ×1')
    expect(text({ type: 'captured', tick: 1, wildId: wild.id, speciesName: 'gastly', level: 9, ball: 'poke-ball', toBox: false })).toBe('Capturou Gastly L9!')
    expect(text({ type: 'captured', tick: 1, wildId: wild.id, speciesName: 'gastly', level: 9, ball: 'poke-ball', toBox: true })).toBe('Capturou Gastly L9! Foi para a mochila de Pokémon')
    expect(text({ type: 'captureFailed', tick: 1, wildId: wild.id, ball: 'poke-ball' })).toBe('A Poké Bola falhou')
    expect(text({ type: 'levelUp', tick: 1, pokemonId: 'p1', level: 13 })).toBe('Charmander subiu para o nível 13')
    expect(text({ type: 'evolved', tick: 1, pokemonId: 'p1', from: 'charmander', to: 'charmeleon' })).toBe('Charmander evoluiu para Charmeleon')
    expect(text({ type: 'itemUsed', tick: 1, itemId: 'potion', pokemonId: 'p1', hp: 18 })).toBe('Usou Poção: HP 18')
    expect(text({ type: 'returning', tick: 1 })).toBe('HP baixo, voltando ao Centro')
    expect(text({ type: 'healed', tick: 1 })).toBe('Time curado')
    expect(text({ type: 'stopped', tick: 1, reason: 'team-fainted' })).toBe('Hunt parada: time caído')
    expect(text({ type: 'pokemonFainted', tick: 1, pokemonId: 'p1' })).toBe('Charmander desmaiou')
    expect(text({ type: 'switched', tick: 1, pokemonId: 'p1' })).toBe('Charmander entrou em campo')
    expect(text({ type: 'skipped', tick: 1, wildId: wild.id })).toBe(`Pulou ${displayName(wild.speciesName)}: nenhum golpe faz efeito`)
    expect(formatEvent({ type: 'moved', tick: 1, from: { x: 0, y: 0 }, to: { x: 1, y: 0 } }, ctx)).toBeNull()
    expect(formatEvent({ type: 'spawned', tick: 1, wildId: 9, speciesName: 'zubat', level: 3, position: { x: 0, y: 0 } }, ctx)).toBeNull()
  })
  it('classifica: attack é combat, recompensas são reward, stopped é alert', () => {
    expect(formatEvent({ type: 'attack', tick: 1, attacker: 'player', attackerId: 'p1', targetId: String(wild.id), move: 'ember', damage: 9, targetHp: 7 }, ctx)?.kind).toBe('combat')
    expect(formatEvent({ type: 'wildDefeated', tick: 1, wildId: wild.id, speciesName: 'zubat', level: 4, xpTrainer: 1, xpPokemon: 1, gold: 1, drops: [] }, ctx)?.kind).toBe('reward')
    expect(formatEvent({ type: 'stopped', tick: 1, reason: 'no-route' }, ctx)?.kind).toBe('alert')
  })
  it('stopReasonText e appendLog (limite de 200)', () => {
    expect(stopReasonText('team-fainted', true)).toBe('Time caído. Time curado no Centro')
    expect(stopReasonText('intent', false)).toBe('Parada por você')
    expect(stopReasonText('persist-failed', false)).toBe('Erro ao salvar; tente de novo')
    const lines = Array.from({ length: 200 }, (_, i) => ({ tick: i, kind: 'info' as const, text: String(i) }))
    const next = appendLog(lines, { tick: 200, kind: 'info', text: 'novo' })
    expect(next).toHaveLength(200)
    expect(next.at(-1)?.text).toBe('novo')
    expect(next[0]?.text).toBe('1')
  })
})
