/**
 * A primeira decisão do jogo: com quem começar.
 *
 * O QUE CAIU, e por quê.
 *
 *  1. TRÊS BOTÕES VERMELHOS. Cada cartão tinha o seu "Escolher" em `primary`, e o vermelho da Poké
 *     Ball é a única cor de marca deste sistema: ela pertence à AÇÃO PRINCIPAL DA TELA, não a uma
 *     por cartão. Três iguais lado a lado não destacam nada — é o mesmo erro que a Loja cometeu
 *     com seis.
 *  2. ESCOLHER ERA IRREVERSÍVEL EM UM CLIQUE. O servidor recusa a segunda escolha, então aquele
 *     clique decidia o jogo inteiro sem nenhum passo entre a curiosidade e o compromisso. Agora
 *     clicar SELECIONA, e um botão só embaixo confirma dizendo o nome de quem vai.
 *  3. "NÍVEL 10" ERA TUDO QUE O CARTÃO DIZIA. Três cartões idênticos, com um sprite e uma palavra
 *     de tipo, transformavam a decisão mais importante do começo numa escolha de cor favorita. Os
 *     números do registro estavam a uma chamada de distância o tempo todo.
 *
 * OS NÚMEROS SÃO OS DE VERDADE, no nível em que o Pokémon chega às suas mãos — `statsAt` é a mesma
 * função que o motor usa em combate. E as barras são normalizadas ENTRE OS TRÊS: a escala existe
 * para comparar estes três, que é a única comparação que esta tela recebe. Contra um teto absoluto
 * as seis barras ficariam curtas e iguais, escondendo justamente a diferença que decide.
 *
 * SÃO DUAS ESCALAS, e não uma. O HP sai de `hpAt`, que soma o nível e mais dez; os outros cinco
 * saem de `statAt`, que não soma nada disso. Na mesma régua o HP ganhava sempre — por FÓRMULA, não
 * por ser tanque — e a barra dele encostava no fim enquanto as cinco de combate ficavam espremidas
 * na metade de baixo, todas parecidas. Medir com a mesma régua coisas calculadas por contas
 * diferentes é o jeito mais fácil de um gráfico honesto mentir.
 */
import { statsAt, type BaseStats } from '@pokeidle/shared'
import type { AppContext } from '../../app-context.js'
import { StarterResponseSchema } from '../../api/dto.js'
import { displayName } from '../../state/log.js'
import { comTipo, el, mount, typeBadge } from '../dom.js'
import { spriteThumb } from '../sprite-css.js'

export const STARTERS = ['charmander', 'bulbasaur', 'squirtle'] as const
const STARTER_LEVEL = 10

/** Lado do sprite do inicial, em pixels: ele é o assunto da tela, e 64 px o deixavam do tamanho
 * de um ícone de lista. Múltiplo inteiro de 32 para o pixel não borrar — e 4x, não 3x: em 96 px o
 * retrato boiava no poço, com mais moldura do que bicho. */
const LADO_INICIAL = 128

/** As seis, na ordem em que o gênero as lê. O rótulo é curto porque ele se repete dezoito vezes. */
const ATRIBUTOS = [
  { chave: 'hp', rotulo: 'HP' },
  { chave: 'attack', rotulo: 'ATQ' },
  { chave: 'defense', rotulo: 'DEF' },
  { chave: 'spAttack', rotulo: 'ATQ.E' },
  { chave: 'spDefense', rotulo: 'DEF.E' },
  { chave: 'speed', rotulo: 'VEL' },
] as const satisfies readonly { chave: keyof BaseStats; rotulo: string }[]

export function mountStarter(root: HTMLElement, ctx: AppContext): () => void {
  const error = el('p', { class: 'form-error', role: 'alert' })
  let escolhido: string | null = null

  const numerosDe = (species: string): BaseStats | null => {
    const base = ctx.registry.species.get(species)?.baseStats
    return base ? statsAt(base, STARTER_LEVEL) : null
  }
  /* Um teto por RÉGUA: o maior HP dos três, e o maior atributo de combate dos três. */
  const maiorEntreOsTres = (chaves: readonly (keyof BaseStats)[]): number => Math.max(1, ...STARTERS.flatMap((s) => {
    const n = numerosDe(s)
    return n ? chaves.map((c) => n[c]) : []
  }))
  const tetoHp = maiorEntreOsTres(['hp'])
  const tetoCombate = maiorEntreOsTres(ATRIBUTOS.filter((a) => a.chave !== 'hp').map((a) => a.chave))

  const confirmar = el('button', { class: 'primary starter-confirmar', type: 'button', disabled: true }, 'Escolha um para começar')

  const enviar = (): void => {
    if (escolhido === null) return
    error.textContent = ''
    confirmar.setAttribute('disabled', '')
    void ctx.http.post('/trainer/starter', { species: escolhido }, StarterResponseSchema)
      .then(() => ctx.go())
      .catch((err: unknown) => {
        error.textContent = err instanceof Error ? err.message : 'não foi possível escolher'
        confirmar.removeAttribute('disabled')
      })
  }
  confirmar.addEventListener('click', enviar)

  /** A barra de um atributo, na régua dele. O número fica ao lado: a barra compara, ele informa. */
  const atributo = (chave: keyof BaseStats, rotulo: string, valor: number): HTMLElement => {
    const trilho = el('span', { class: 'starter-trilho' }, el('span', { class: 'starter-preenche' }))
    trilho.style.setProperty('--fracao', String(valor / (chave === 'hp' ? tetoHp : tetoCombate)))
    return el('div', { class: 'starter-atributo' },
      el('span', { class: 'starter-atributo-nome' }, rotulo),
      trilho,
      el('span', { class: 'starter-atributo-valor' }, String(valor)))
  }

  const card = (species: string): HTMLElement => {
    const especie = ctx.registry.species.get(species)
    const tipos = especie?.types ?? []
    const numeros = numerosDe(species)
    const evolucao = especie?.evolvesTo
    /*
     * RÁDIO NATIVO, escondido dentro do rótulo.
     *
     * Escolher um de três é exatamente o que o rádio é, e usá-lo entrega de graça o que uma
     * pilha de `<button aria-pressed>` teria de imitar à mão: exclusividade mútua anunciada ao
     * leitor de tela, navegação por setas, e o estado marcado alcançável pelo CSS com `:has`.
     */
    const radio = el('input', { type: 'radio', name: 'inicial', value: species, class: 'so-leitor' })
    radio.addEventListener('change', () => {
      escolhido = species
      confirmar.removeAttribute('disabled')
      confirmar.textContent = `Começar com ${displayName(species)}`
    })
    return comTipo(el('label', { class: 'starter-card', 'data-species': species },
      radio,
      // O poço do retrato é o mesmo das peças do time, na cor do tipo — aqui em tamanho de
      // pôster, porque este sprite é o assunto da tela inteira e não um item de lista.
      el('span', { class: 'starter-poco' }, spriteThumb(ctx.atlas, species, LADO_INICIAL)),
      el('span', { class: 'starter-nome' }, displayName(species)),
      el('span', { class: 'starter-tipos' }, ...tipos.map(typeBadge)),
      numeros ? el('div', { class: 'starter-numeros' }, ...ATRIBUTOS.map((a) => atributo(a.chave, a.rotulo, numeros[a.chave]))) : null,
      // A linha de evolução é o que a escolha compra a longo prazo, e é o dado que o jogador
      // novo mais quer e menos tem como adivinhar.
      evolucao && 'level' in evolucao
        ? el('span', { class: 'starter-evolucao' }, `evolui em ${displayName(evolucao.species)} no nv ${evolucao.level}`)
        : null), tipos)
  }

  mount(root, el('main', { class: 'screen screen-starter' },
    el('header', { class: 'starter-cabeca' },
      el('h1', {}, 'Escolha seu inicial'),
      // O aviso vem ANTES, não depois do clique: é a única informação que muda como a pessoa
      // decide, e depois de escolher ela não serve para nada.
      el('p', { class: 'starter-nota' }, `Nível ${STARTER_LEVEL}, e a escolha não volta atrás. O resto do time você captura.`)),
    el('fieldset', { class: 'starter-grade' },
      el('legend', { class: 'so-leitor' }, 'Pokémon inicial'),
      ...STARTERS.map(card)),
    confirmar,
    error))
  return () => { root.replaceChildren() }
}
