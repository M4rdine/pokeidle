/**
 * A peça de um Pokémon, usada pelo HUD e pelo modal de Time.
 *
 * O QUE ESTES CASOS SEGURAM. O modal mostrava os mesmos Pokémon do HUD como linhas de texto —
 * "charmander L10" ao lado de "5/10" em cinza — enquanto a coluna do jogo, a dois cliques dali,
 * mostrava retrato num poço da cor do tipo, selos e medidor com estado. Duas marcações escritas à
 * mão para o mesmo assunto, e a pior delas na tela onde o time é de fato organizado.
 *
 * O teste não compara aparência: compara a ESTRUTURA que as duas formas têm de ter em comum. Se
 * alguém escrever uma terceira versão à mão em qualquer das duas telas, o caso cai.
 */
import { loadRegistry } from '@pokeidle/shared'
import { describe, expect, it, vi } from 'vitest'
import { createContext } from '../../src/app-context.js'
import { createStore } from '../../src/state/store.js'
import { initialSession } from '../../src/state/session.js'
import { slotAlvo, slotCartao, vagaLivre, vagaTravada } from '../../src/ui/pokemon-slot.js'

const ctx = createContext({ registry: loadRegistry(), session: createStore(initialSession()) })
const charmander = { speciesName: 'charmander', level: 10, hp: 5, hpMax: 10 }

describe('a peça de um Pokémon', () => {
  it('as duas formas trazem o mesmo miolo: poço, nome, nível, selos de tipo e medidor', () => {
    const doHud = slotAlvo({ ctx, id: 'a', pokemon: charmander, ativo: false, aoClicar: () => {} })
    const doModal = slotCartao({ ctx, id: 'a', pokemon: charmander, aoAbrirFicha: () => {}, acoes: [] })
    for (const peca of [doHud, doModal]) {
      expect(peca.querySelector('.slot-poco .sprite-thumb')).not.toBeNull()
      expect(peca.querySelector('.slot-nome')?.textContent).toBe('Charmander')
      expect(peca.querySelector('.chip-nivel')?.textContent).toBe('nv 10')
      expect([...peca.querySelectorAll('.slot-tipos .chip')].map((c) => c.textContent)).toEqual(['fire'])
      expect(peca.querySelector('.hp-bar')?.getAttribute('value')).toBe('5')
      expect(peca.querySelector('.slot-hp')?.textContent).toBe('5/10')
    }
  })

  it('o poço leva a cor do TIPO, que é o que faz seis peças lerem como seis criaturas', () => {
    // Seis poços de ardósia idêntica não diziam nada de relance. A cor chega antes da palavra.
    const poco = slotAlvo({ ctx, id: 'a', pokemon: charmander, ativo: false, aoClicar: () => {} })
      .querySelector<HTMLElement>('.slot-poco')!
    expect(poco.style.getPropertyValue('--tipo')).toBe('var(--type-fire)')
  })

  it('o medidor muda de estado com a fração, e é a cor que avisa — não o número', () => {
    const estado = (hp: number, hpMax: number): string | null =>
      slotAlvo({ ctx, id: 'a', pokemon: { ...charmander, hp, hpMax }, ativo: false, aoClicar: () => {} })
        .querySelector('.hp-bar')!.getAttribute('data-hp-state')
    expect(estado(10, 10)).toBe('ok')
    expect(estado(4, 10)).toBe('ferido')
    expect(estado(1, 10)).toBe('critico')
    // Sem HP máximo não existe fração; o pior caso é o seguro, não uma divisão por zero.
    expect(estado(0, 0)).toBe('critico')
  })

  it('a forma do HUD é um botão inteiro; a do modal não pode ser, porque carrega botões', () => {
    /*
     * É a única diferença real entre as duas, e é de ESTRUTURA: no HUD clicar na peça troca o
     * ativo, então ela É o alvo. No modal ela leva subir, descer e guardar — e botão dentro de
     * botão não existe em HTML. Foi por isso que viraram duas funções em vez de uma bandeira.
     */
    const aoClicar = vi.fn()
    const doHud = slotAlvo({ ctx, id: 'a', pokemon: charmander, ativo: true, aoClicar })
    expect(doHud.tagName).toBe('BUTTON')
    expect(doHud.classList.contains('slot-active')).toBe(true)
    doHud.dispatchEvent(new MouseEvent('click'))
    expect(aoClicar).toHaveBeenCalledOnce()

    const aoAbrirFicha = vi.fn()
    const acao = document.createElement('button')
    const doModal = slotCartao({ ctx, id: 'a', pokemon: charmander, aoAbrirFicha, acoes: [acao] })
    expect(doModal.tagName).toBe('DIV')
    expect(doModal.querySelector('.slot-acoes')?.children).toHaveLength(1)
    const ficha = doModal.querySelector<HTMLButtonElement>('.slot-ficha')!
    ficha.dispatchEvent(new MouseEvent('click'))
    expect(aoAbrirFicha).toHaveBeenCalledOnce()
    // Quem não vê a tela precisa saber para onde o retrato leva.
    expect(ficha.getAttribute('aria-label')).toBe('ver a ficha de Charmander')
  })

  it('vaga livre é um encaixe sem palavra; vaga travada diz o nível que a abre', () => {
    expect(vagaLivre().querySelector('.soquete')).not.toBeNull()
    expect(vagaLivre().textContent).toBe('')
    expect(vagaTravada(23).textContent).toBe('nv 23')
    // Sem nível conhecido, "indisponível" — e não um "nv null" que não quer dizer nada.
    expect(vagaTravada(null).textContent).toBe('indisponível')
  })
})
