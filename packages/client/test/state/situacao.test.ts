import { describe, expect, it } from 'vitest'
import { situacaoDoTime, type Situacao } from '../../src/state/situacao.js'
import { emptyHuntView } from '../../src/state/hunt-view.js'

const comModo = (mode: string, extra: Record<string, unknown> = {}) => ({
  ...emptyHuntView(),
  state: { player: { mode, targetWildId: null, healingUntilTick: null, ...extra }, wilds: [] },
}) as never

describe('o que o time está fazendo agora', () => {
  it('traduz cada modo do motor para uma frase que o jogador entende', () => {
    const casos: [string, string][] = [
      ['searching', 'procurando'],
      ['walking', 'a caminho'],
      ['fighting', 'em combate'],
      ['returning', 'voltando ao Centro'],
      ['healing', 'curando'],
      ['stopped', 'parado'],
    ]
    for (const [modo, esperado] of casos) {
      expect(situacaoDoTime(comModo(modo)).texto, modo).toBe(esperado)
    }
  })

  it('em combate, diz contra quem — o alvo é o dado que decide se vale intervir', () => {
    const view = {
      ...emptyHuntView(),
      state: {
        player: { mode: 'fighting', targetWildId: 7, healingUntilTick: null },
        wilds: [{ id: 7, speciesName: 'vulpix', level: 4, hp: 3, hpMax: 20 }],
      },
    } as never
    const s: Situacao = situacaoDoTime(view)
    expect(s.texto).toBe('em combate')
    expect(s.alvo).toEqual({ nome: 'Vulpix', nivel: 4, hp: 3, hpMax: 20 })
  })

  it('alvo que sumiu da lista não vira ficha fantasma', () => {
    const view = {
      ...emptyHuntView(),
      state: { player: { mode: 'fighting', targetWildId: 99, healingUntilTick: null }, wilds: [] },
    } as never
    expect(situacaoDoTime(view).alvo).toBeNull()
  })

  it('sem hunt nenhuma, a situação é "sem caçada" e não um modo inventado', () => {
    expect(situacaoDoTime(emptyHuntView()).texto).toBe('sem caçada')
  })

  it('modo que o motor passe a emitir e a tela não conheça aparece cru, em vez de sumir', () => {
    expect(situacaoDoTime(comModo('teleportando')).texto).toBe('teleportando')
  })
})
