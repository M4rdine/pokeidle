/**
 * O momento da captura.
 *
 * Capturar é o que o jogo existe para produzir, e passava como um anel de 400 ms no canvas e uma
 * linha no registro — menos presença na tela do que um Pokémon tomando dano.
 *
 * O que estes casos seguram não é a aparência, é o CONTRATO: a bola mostrada é a que pegou, a
 * falha reusa a mesma peça com outro fim, uma captura substitui a anterior, e o desmonte não
 * depende da animação — porque com `prefers-reduced-motion` a casa zera toda duração, e uma peça
 * presa no `animationend` sumiria no mesmo quadro em que apareceu.
 */
import { loadRegistry } from '@pokeidle/shared'
import type { Event } from '@pokeidle/shared/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createContext } from '../../../src/app-context.js'
import type { GameLoop } from '../../../src/game-loop.js'
import { createStore } from '../../../src/state/store.js'
import { initialSession } from '../../../src/state/session.js'
import { mountCaptura } from '../../../src/ui/hud/captura.js'

const registry = loadRegistry()

/** Um laço falso: só o canal de eventos, que é o único que este componente usa. */
function laco() {
  const ouvintes = new Set<(e: Event) => void>()
  const loop = { onEvent: (l: (e: Event) => void) => { ouvintes.add(l); return () => ouvintes.delete(l) } } as unknown as GameLoop
  return { loop, emitir: (e: Event) => { for (const l of ouvintes) l(e) } }
}

const capturou = (ball: string, toBox = false): Event =>
  ({ type: 'captured', tick: 1, wildId: 1, speciesName: 'pikachu', level: 7, ball, toBox })
const falhou = (ball: string): Event => ({ type: 'captureFailed', tick: 1, wildId: 1, ball })

const montar = () => {
  const { loop, emitir } = laco()
  const root = document.createElement('div')
  const parar = mountCaptura(root, createContext({ registry, loop, session: createStore(initialSession()) }))
  return { root, emitir, parar }
}
const peca = (root: HTMLElement) => root.querySelector<HTMLElement>('.captura')

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('o momento da captura', () => {
  it('mostra A BOLA QUE PEGOU, e não uma genérica', () => {
    // O evento carrega o id do item. Ver a Ultra quando foi a Ultra é informação de graça, e vale
    // mais desde que as bolas viraram situacionais e a escolha passou a ser do motor.
    const { root, emitir } = montar()
    emitir(capturou('ultra-ball'))
    expect(peca(root)?.getAttribute('data-ball')).toBe('ultra-ball')
    expect(peca(root)?.querySelector('.icone-item')?.getAttribute('data-item')).toBe('ultra-ball')
    expect(peca(root)?.textContent).toContain('Pikachu')
    // O nome da bola sai do registro: o id cru não diz nada a quem joga.
    expect(peca(root)?.textContent).toContain('Ultra Bola')
  })

  it('diz quando o bicho foi para a mochila, que é a única pergunta que sobra depois de "pegou"', () => {
    const { root, emitir } = montar()
    emitir(capturou('poke-ball', true))
    expect(peca(root)?.textContent).toContain('foi para a mochila')
  })

  it('a FALHA é a mesma peça com outro fim, e sai mais cedo', () => {
    /*
     * Ver o mesmo objeto terminar de dois jeitos é o que faz o movimento informar em vez de
     * enfeitar: o jogador aprende a ler o fim e para de procurar no registro se pegou.
     */
    const { root, emitir } = montar()
    emitir(falhou('great-ball'))
    expect(peca(root)?.classList.contains('captura-falhou')).toBe(true)
    expect(peca(root)?.textContent).toContain('escapou')
    expect(peca(root)?.textContent).not.toContain('Pikachu')

    vi.advanceTimersByTime(900)
    expect(peca(root)).toBeNull()
  })

  it('o relógio não depende da animação: a peça sai sozinha', () => {
    // Com `prefers-reduced-motion` a casa zera toda duração. Preso ao `animationend`, o desmonte
    // aconteceria no mesmo quadro em que a peça aparece.
    const { root, emitir } = montar()
    emitir(capturou('poke-ball'))
    vi.advanceTimersByTime(1699)
    expect(peca(root)).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(peca(root)).toBeNull()
  })

  it('uma de cada vez: a nova substitui a anterior em vez de empilhar', () => {
    // Num idle as capturas vêm em rajada, e duas empilhadas ficariam ilegíveis.
    const { root, emitir } = montar()
    emitir(capturou('poke-ball'))
    emitir(capturou('net-ball'))
    expect(root.querySelectorAll('.captura')).toHaveLength(1)
    expect(peca(root)?.getAttribute('data-ball')).toBe('net-ball')
  })

  it('o desmonte leva a peça e o relógio junto', () => {
    // Sem isto, sair da tela do jogo deixaria um temporizador mexendo num nó já removido.
    const { root, emitir, parar } = montar()
    emitir(capturou('poke-ball'))
    parar()
    expect(peca(root)).toBeNull()
    // E o evento seguinte não desenha mais nada: a assinatura foi cancelada.
    emitir(capturou('ultra-ball'))
    expect(peca(root)).toBeNull()
  })
})
