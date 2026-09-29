/**
 * A cabeça do selvagem, caso a caso.
 *
 * O que estes testes protegem não é "o bicho anda": é o conjunto de regras que separa uma caçada
 * de um tiroteio absurdo. Parede tem que esconder e tem que parar tiro; a coleira tem que existir
 * para o jogador não arrastar a área inteira atrás de si; e quem chega tem que atacar primeiro,
 * senão aproximar-se de qualquer bicho passa a custar uma rodada de dano de graça.
 */
import { describe, expect, it } from 'vitest'
import { createRng, type HuntMap } from '@pokeidle/shared'
import { stepWild, stepWilds, percebe, posturaDe, casaDo } from '../../src/engine/wild-ai.js'
import { TIQUES_POR_PASSO_CACANDO, TIQUES_POR_PASSO_VAGANDO } from '../../src/engine/constants.js'
import type { EngineDeps, HuntState, Point, WildState } from '../../src/engine/types.js'
import { baseState, miniRegistry } from './fixtures/mini.js'

/** Um mapa desenhado: `#` barra passagem, `.` anda. O spawn 0 fica onde estiver o `c` (casa). */
function mapa(desenho: readonly string[]): HuntMap {
  const width = desenho[0]!.length
  const height = desenho.length
  const blocking = desenho.flatMap((l) => [...l].map((c) => c === '#'))
  const i = desenho.join('').indexOf('c')
  const casa = { x: i % width, y: Math.floor(i / width) }
  return {
    id: 'ai', name: 'AI', width, height, tileSize: 32,
    layers: { ground: Array(width * height).fill('grass'), detail: Array(width * height).fill(null), blocking },
    spawnPoint: { x: 0, y: 0 }, pokecenter: { x: width - 1, y: height - 1 },
    spawns: [{ speciesName: 'zubat', minLevel: 3, maxLevel: 3, ...casa, radius: 0, count: 1, respawnSeconds: 2 }],
  }
}

const deps = (hunt: HuntMap, seed = 1): EngineDeps => ({ registry: miniRegistry(), hunt, rng: createRng(seed) })

const selvagem = (id: number, position: Point, speciesName = 'zubat'): WildState =>
  ({ id, spawnIndex: 0, speciesName, level: 3, hp: 30, hpMax: 30, position, cooldowns: {}, captureTried: false })

function estado(d: EngineDeps, jogador: Point, wilds: readonly WildState[], tick = 0): HuntState {
  const s = baseState({}, d)
  return { ...s, tick, wilds: [...wilds], player: { ...s.player, position: jogador, mode: 'searching', targetWildId: null, path: [] } }
}

/** Sala aberta larga; a coluna de `#` é a parede que esconde. */
const ABERTO = ['..........', '..........', '....c.....', '..........', '..........']
const PAREDE = ['..........', '..........', '..#.c.....', '..........', '..........']

describe('percepção', () => {
  it('nota o jogador perto e à vista', () => {
    const d = deps(mapa(ABERTO))
    const s = estado(d, { x: 2, y: 2 }, [selvagem(1, { x: 4, y: 2 })])
    expect(percebe(s.wilds[0]!, s.player.position, d)).toBe(true)
  })

  it('não nota através da rocha — senão parede vira vidro', () => {
    const d = deps(mapa(PAREDE))
    const s = estado(d, { x: 1, y: 2 }, [selvagem(1, { x: 4, y: 2 })])
    expect(percebe(s.wilds[0]!, s.player.position, d)).toBe(false)
  })

  it('não nota o que está longe, mesmo à vista', () => {
    const largo = ['.'.repeat(30), '.'.repeat(30), '....c' + '.'.repeat(25), '.'.repeat(30)]
    const d = deps(mapa(largo))
    const s = estado(d, { x: 25, y: 2 }, [selvagem(1, { x: 4, y: 2 })])
    expect(percebe(s.wilds[0]!, s.player.position, d)).toBe(false)
  })
})

describe('postura', () => {
  it('caça quem ele nota', () => {
    const d = deps(mapa(ABERTO))
    const s = estado(d, { x: 2, y: 2 }, [selvagem(1, { x: 4, y: 2 })])
    expect(posturaDe(s.wilds[0]!, s.player.position, d)).toBe('cacando')
  })

  it('vaga quando não nota ninguém', () => {
    const d = deps(mapa(PAREDE))
    const s = estado(d, { x: 1, y: 2 }, [selvagem(1, { x: 4, y: 2 })])
    expect(posturaDe(s.wilds[0]!, s.player.position, d)).toBe('vagando')
  })

  it('volta para casa quando se afastou demais, mesmo vendo o jogador', () => {
    const largo = ['.'.repeat(30), '.'.repeat(30), '....c' + '.'.repeat(25), '.'.repeat(30)]
    const d = deps(mapa(largo))
    const longe = selvagem(1, { x: 20, y: 2 })
    const s = estado(d, { x: 21, y: 2 }, [longe])
    expect(casaDo(longe, d)).toEqual({ x: 4, y: 2 })
    expect(posturaDe(longe, s.player.position, d)).toBe('voltando')
  })
})

describe('movimento', () => {
  it('caçando, dá um passo na direção do jogador', () => {
    const d = deps(mapa(ABERTO))
    // O passo só sai no tique em que `(tique + id) % período === 0`.
    const tick = TIQUES_POR_PASSO_CACANDO - 1
    const s = estado(d, { x: 0, y: 2 }, [selvagem(1, { x: 5, y: 2 })], tick)
    const r = stepWild(s, d, 1, s.player.position)
    expect(r.state.wilds[0]!.position).toEqual({ x: 4, y: 2 })
    expect(r.events).toEqual([{ type: 'wildMoved', tick, wildId: 1, from: { x: 5, y: 2 }, to: { x: 4, y: 2 } }])
  })

  it('não anda todo tique: fora do período, fica parado', () => {
    const d = deps(mapa(ABERTO))
    const s = estado(d, { x: 0, y: 2 }, [selvagem(1, { x: 5, y: 2 })], TIQUES_POR_PASSO_CACANDO)
    expect(stepWild(s, d, 1, s.player.position).events).toEqual([])
  })

  it('vagando, anda no passo lento e sem sair da coleira', () => {
    const d = deps(mapa(PAREDE))
    const tick = TIQUES_POR_PASSO_VAGANDO - 1
    const s = estado(d, { x: 0, y: 0 }, [selvagem(1, { x: 4, y: 2 })], tick)
    const r = stepWild(s, d, 1, s.player.position)
    expect(r.events).toHaveLength(1)
    const destino = r.state.wilds[0]!.position
    expect(Math.abs(destino.x - 4) + Math.abs(destino.y - 2)).toBe(1)
  })

  it('dois selvagens nunca param na mesma célula', () => {
    const d = deps(mapa(ABERTO))
    const s = estado(d, { x: 0, y: 2 }, [selvagem(1, { x: 4, y: 2 }), selvagem(2, { x: 4, y: 3 })], 0)
    let cur = s
    for (let i = 0; i < 40; i++) {
      const r = stepWilds({ ...cur, tick: i }, d, cur.player.position)
      cur = r.state
      const [a, b] = cur.wilds
      expect(a!.position).not.toEqual(b!.position)
    }
  })

  it('o passeio é reprodutível e NÃO depende do RNG do motor', () => {
    /*
     * A semente muda o combate e o loot; não pode mudar por onde o bicho anda. Quando mudava,
     * qualquer alteração na ordem dos sorteios mexia no mapa e daí no ouro — foi um teste de
     * raridade que denunciou o acoplamento.
     */
    const passeio = (seed: number): Point[] => {
      const d = deps(mapa(PAREDE), seed)
      let cur = estado(d, { x: 0, y: 0 }, [selvagem(1, { x: 4, y: 2 })])
      const passos: Point[] = []
      for (let i = 0; i < 60; i++) {
        cur = stepWilds({ ...cur, tick: i }, d, cur.player.position).state
        passos.push(cur.wilds[0]!.position)
      }
      return passos
    }
    expect(passeio(7)).toEqual(passeio(7))
    expect(passeio(7)).toEqual(passeio(8))
  })

  it('bichos diferentes não andam em bloco: o id separa os passeios', () => {
    const d = deps(mapa(['.'.repeat(12), '.'.repeat(12), '....c' + '.'.repeat(7), '.'.repeat(12), '.'.repeat(12)]))
    const trilha = (id: number): Point[] => {
      let cur = estado(d, { x: 11, y: 4 }, [selvagem(id, { x: 4, y: 2 })])
      const passos: Point[] = []
      for (let i = 0; i < 60; i++) {
        cur = stepWilds({ ...cur, tick: i }, d, cur.player.position).state
        passos.push(cur.wilds[0]!.position)
      }
      return passos
    }
    expect(trilha(1)).not.toEqual(trilha(2))
  })
})

describe('ataque', () => {
  it('golpe especial acerta de longe, com linha de visão', () => {
    const d = deps(mapa(ABERTO))
    // Charmander selvagem: `ember` é especial, alcance 4.
    const s = estado(d, { x: 1, y: 2 }, [selvagem(1, { x: 4, y: 2 }, 'charmander')])
    const r = stepWild(s, d, 1, s.player.position)
    const ataque = r.events.find((e) => e.type === 'attack')
    expect(ataque).toMatchObject({ attacker: 'wild', move: 'ember' })
  })

  it('golpe físico não alcança de longe: o bicho anda em vez de atacar', () => {
    const d = deps(mapa(ABERTO))
    // Zubat só tem `leech-life`, que é físico.
    const s = estado(d, { x: 1, y: 2 }, [selvagem(1, { x: 4, y: 2 })], TIQUES_POR_PASSO_CACANDO - 1)
    const r = stepWild(s, d, 1, s.player.position)
    expect(r.events.some((e) => e.type === 'attack')).toBe(false)
    expect(r.events.some((e) => e.type === 'wildMoved')).toBe(true)
  })

  it('não atira através da rocha', () => {
    const d = deps(mapa(PAREDE))
    const s = estado(d, { x: 1, y: 2 }, [selvagem(1, { x: 4, y: 2 }, 'charmander')])
    expect(s.wilds[0]!.position.x - s.player.position.x).toBe(3) // dentro do alcance de `ember`
    expect(stepWild(s, d, 1, s.player.position).events.some((e) => e.type === 'attack')).toBe(false)
  })

  it('quem chega ataca primeiro: entrar no alcance não custa dano no mesmo tique', () => {
    const d = deps(mapa(ABERTO))
    const s = estado(d, { x: 3, y: 2 }, [selvagem(1, { x: 4, y: 2 })])
    // O jogador ESTAVA a 5 tiles e acabou de encostar: o selvagem não revida neste tique.
    const chegando = stepWild(s, d, 1, { x: 9, y: 2 })
    expect(chegando.events.some((e) => e.type === 'attack')).toBe(false)
    // No tique seguinte, com o jogador já ali desde o início, revida.
    const parado = stepWild(s, d, 1, s.player.position)
    expect(parado.events.some((e) => e.type === 'attack')).toBe(true)
  })

  it('revida mesmo voltando para casa — senão bastaria empurrá-lo para fora da coleira', () => {
    const largo = ['.'.repeat(30), '.'.repeat(30), '....c' + '.'.repeat(25), '.'.repeat(30)]
    const d = deps(mapa(largo))
    const longe = selvagem(1, { x: 20, y: 2 })
    const s = estado(d, { x: 21, y: 2 }, [longe])
    expect(posturaDe(longe, s.player.position, d)).toBe('voltando')
    expect(stepWild(s, d, 1, s.player.position).events.some((e) => e.type === 'attack')).toBe(true)
  })
})
