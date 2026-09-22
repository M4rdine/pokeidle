/**
 * O painel de volta: o que aconteceu enquanto o jogador estava fora.
 *
 * Num idle este é O momento de pagamento — é a única tela que responde "valeu a pena deixar
 * rodando?". Era uma linha de toast que sumia em segundos: "Catch-up: 54000 ticks, 812 derrotas,
 * 4 capturas, +91234 XP, +12045 ouro", com o número de ticks na frente e o ouro no fim.
 */
import type { Summary } from '@pokeidle/shared/protocol'
import { describe, expect, it, vi } from 'vitest'
import { painelDeRetorno, TETO_DE_CATCHUP_TICKS } from '../../../src/ui/hud/retorno.js'

const resumo = (over: Partial<Summary> = {}): Summary => ({
  ticks: 18_000, defeats: 240, captures: 3, captureFailures: 7, faints: 0,
  xpTrainer: 91_234, gold: 12_045, drops: {}, levelUps: 0, evolutions: 0, returns: 0, ...over,
})

const montar = (over: Partial<Summary> = {}, aoFechar = (): void => {}): HTMLElement =>
  painelDeRetorno(resumo(over), { nomeDoItem: (id) => (id === 'potion' ? 'Poção' : id), aoFechar })

const texto = (el: HTMLElement, selector: string): string => el.querySelector(selector)?.textContent ?? ''

describe('painel de volta', () => {
  it('diz há quanto tempo, em hora e minuto — não em ticks', () => {
    // 18 000 ticks a 200 ms é uma hora. "18000 ticks" não é uma unidade de nada para quem joga.
    expect(texto(montar(), '[data-fora]')).toBe('1 h')
    expect(texto(montar({ ticks: 19_500 }), '[data-fora]')).toBe('1 h 5 min')
    expect(texto(montar({ ticks: 900 }), '[data-fora]')).toBe('3 min')
    expect(texto(montar({ ticks: 40 }), '[data-fora]')).toBe('8 s')
  })

  it('XP e ouro são o assunto: as duas leituras grandes, com o número separado por milhar', () => {
    const p = montar()
    expect(texto(p, '[data-xp]')).toBe('91.234')
    expect(texto(p, '[data-ouro]')).toBe('12.045')
  })

  it('o que não aconteceu não ocupa linha', () => {
    // Zero capturas e zero quedas não são informação; são ruído no lugar onde o jogador procura o
    // que aconteceu de bom.
    const p = montar({ captures: 0, faints: 0, returns: 0, levelUps: 0, evolutions: 0 })
    expect(p.querySelector('[data-capturas]')).toBeNull()
    expect(p.querySelector('[data-quedas]')).toBeNull()
    expect(p.querySelector('[data-niveis]')).toBeNull()
  })

  it('subir de nível e evoluir aparecem, porque são o que muda o time', () => {
    const p = montar({ levelUps: 3, evolutions: 1 })
    expect(texto(p, '[data-niveis]')).toContain('3')
    expect(texto(p, '[data-evolucoes]')).toContain('1')
  })

  it('o que caiu vem com o nome do item, não com o id', () => {
    const p = montar({ drops: { potion: 4 } })
    expect(texto(p, '[data-drops]')).toContain('Poção')
    expect(texto(p, '[data-drops]')).toContain('4')
  })

  it('no teto do catch-up avisa que o tempo além dele não foi simulado', () => {
    /*
     * Sem este aviso, quem voltasse depois de dois dias leria "12 h" e concluiria que o jogo comeu
     * o resto. O teto existe (o servidor não simula mais que isso de uma vez), mas quem está
     * lendo a tela não tem como saber disso.
     */
    const p = montar({ ticks: TETO_DE_CATCHUP_TICKS })
    expect(texto(p, '[data-teto]')).toContain('12 h')
    expect(montar({ ticks: TETO_DE_CATCHUP_TICKS - 1 }).querySelector('[data-teto]')).toBeNull()
  })

  it('o botão fecha o painel', () => {
    const aoFechar = vi.fn()
    const p = montar({}, aoFechar)
    p.querySelector('button')!.click()
    expect(aoFechar).toHaveBeenCalledTimes(1)
  })
})
