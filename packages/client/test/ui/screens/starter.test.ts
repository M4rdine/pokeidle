/**
 * A primeira decisão do jogo.
 *
 * O que estes casos seguram é o que a versão anterior errava: três botões `primary` — o vermelho
 * da marca repetido três vezes, destacando nada —, a escolha efetivada num clique só, e um cartão
 * cujo único dado era "Nível 10", igual nos três.
 */
import { loadRegistry, statsAt } from '@pokeidle/shared'
import { describe, expect, it, vi } from 'vitest'
import { createContext } from '../../../src/app-context.js'
import { mountStarter } from '../../../src/ui/screens/starter.js'

const registry = loadRegistry()
const montar = (over: Record<string, unknown> = {}) => {
  const root = document.createElement('div')
  mountStarter(root, createContext({ registry, ...over }))
  return root
}
const cartao = (root: HTMLElement, species: string) =>
  root.querySelector<HTMLElement>(`.starter-card[data-species=${species}]`)!
const confirmar = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('.starter-confirmar')!

describe('tela do inicial', () => {
  it('mostra os três, com tipos e o aviso de que a escolha não volta', () => {
    const root = montar()
    expect(root.textContent).toContain('Escolha seu inicial')
    expect([...root.querySelectorAll('.starter-card')].map((c) => c.getAttribute('data-species')))
      .toEqual(['charmander', 'bulbasaur', 'squirtle'])
    expect([...cartao(root, 'bulbasaur').querySelectorAll('.type')].map((t) => t.textContent))
      .toEqual(['grass', 'poison'])
    // O aviso vem ANTES do clique. Depois de escolher ele não serve para nada, e o servidor
    // recusa a segunda escolha.
    expect(root.textContent).toContain('não volta atrás')
  })

  it('cada cartão traz os SEIS atributos no nível de entrega, com os números do motor', () => {
    // `statsAt` é a mesma função que o combate usa: se a tela calculasse por conta própria,
    // ela mentiria no dia em que a fórmula mudasse.
    const esperado = statsAt(registry.species.get('squirtle')!.baseStats, 10)
    const linhas = [...cartao(montar(), 'squirtle').querySelectorAll('.starter-atributo')]
    expect(linhas.map((l) => l.querySelector('.starter-atributo-nome')?.textContent))
      .toEqual(['HP', 'ATQ', 'DEF', 'ATQ.E', 'DEF.E', 'VEL'])
    expect(linhas.map((l) => l.querySelector('.starter-atributo-valor')?.textContent))
      .toEqual([esperado.hp, esperado.attack, esperado.defense, esperado.spAttack, esperado.spDefense, esperado.speed].map(String))
  })

  it('as barras comparam os TRÊS entre si, e nenhuma passa do fim da régua', () => {
    /*
     * A escala é o que faz as barras informarem. Se cada cartão se normalizasse contra o próprio
     * máximo, os três teriam uma barra cheia e a comparação — que é o trabalho inteiro desta
     * tela — viraria ruído.
     */
    const fracoes = [...montar().querySelectorAll<HTMLElement>('.starter-trilho')]
      .map((t) => Number(t.style.getPropertyValue('--fracao')))
    expect(fracoes).toHaveLength(18)
    expect(Math.max(...fracoes)).toBe(1)
    expect(Math.min(...fracoes)).toBeGreaterThan(0)
  })

  it('o HP tem RÉGUA PRÓPRIA, porque sai de outra fórmula', () => {
    /*
     * `hpAt` soma o nível e mais dez; `statAt` não soma nada disso. Na mesma régua o HP ganhava
     * sempre — por fórmula, não por ser tanque — e as cinco barras de combate ficavam espremidas
     * na metade de baixo, todas parecidas.
     *
     * A prova: o maior HP e o maior atributo de combate são números DIFERENTES, e as duas barras
     * chegam ao fim. Com uma régua só, a de combate pararia na fração entre os dois.
     */
    const root = montar()
    const fracao = (species: string, indice: number): number => Number(
      [...cartao(root, species).querySelectorAll<HTMLElement>('.starter-trilho')][indice]!
        .style.getPropertyValue('--fracao'))
    const n = statsAt(registry.species.get('bulbasaur')!.baseStats, 10)
    // Bulbasaur tem o maior HP e o maior ataque especial entre os três.
    expect(fracao('bulbasaur', 0)).toBe(1)
    expect(fracao('bulbasaur', 3)).toBe(1)
    expect(n.spAttack).toBeLessThan(n.hp)
  })

  it('a linha de evolução diz o que a escolha compra depois', () => {
    expect(cartao(montar(), 'charmander').textContent).toContain('evolui em Charmeleon no nv 16')
  })

  it('um botão só, e ele não faz nada até haver escolha', () => {
    /*
     * Eram TRÊS `primary`, um por cartão. O vermelho da Poké Ball é a única cor de marca deste
     * sistema e pertence à ação principal da tela — três iguais lado a lado não destacam nada.
     */
    const root = montar()
    expect(root.querySelectorAll('button.primary')).toHaveLength(1)
    expect(confirmar(root).hasAttribute('disabled')).toBe(true)
    expect(confirmar(root).textContent).toBe('Escolha um para começar')
  })

  it('escolher seleciona; só o confirmar manda o POST, e ele diz o nome de quem vai', async () => {
    // O servidor recusa a segunda escolha, então aquele clique decidia o jogo inteiro sem nenhum
    // passo entre a curiosidade e o compromisso.
    const post = vi.fn(async () => ({ pokemon: {} }))
    const go = vi.fn(async () => {})
    const root = montar({ http: { post } as never, go })

    const radio = cartao(root, 'charmander').querySelector<HTMLInputElement>('input[type=radio]')!
    radio.checked = true
    radio.dispatchEvent(new Event('change'))
    expect(post).not.toHaveBeenCalled()
    expect(confirmar(root).hasAttribute('disabled')).toBe(false)
    expect(confirmar(root).textContent).toBe('Começar com Charmander')

    confirmar(root).click()
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(post).toHaveBeenCalledWith('/trainer/starter', { species: 'charmander' }, expect.anything())
    expect(go).toHaveBeenCalled()
  })

  it('os três rádios formam UM grupo: escolher um desmarca o anterior', () => {
    // É por isso que são rádios nativos e não `button aria-pressed`: exclusividade mútua, setas do
    // teclado e o estado marcado alcançável pelo CSS, tudo sem código.
    const root = montar()
    const nomes = [...root.querySelectorAll<HTMLInputElement>('.starter-card input[type=radio]')]
    expect(new Set(nomes.map((r) => r.name)).size).toBe(1)
    expect(root.querySelector('legend')?.textContent).toBe('Pokémon inicial')
  })
})
