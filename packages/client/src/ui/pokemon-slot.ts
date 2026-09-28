/**
 * A PEÇA DE UM POKÉMON. Uma só, para o jogo inteiro.
 *
 * Ela nasceu na coluna do time do HUD: retrato num poço com a cor do tipo, nome e nível na
 * primeira linha, selos de tipo na segunda, medidor de HP com o número por dentro na terceira. E
 * ficou só lá — o modal de Time, que é onde o jogador de fato ORGANIZA o time, mostrava os mesmos
 * Pokémon como linhas de texto puro: "bulbasaur L12" e "31/31" em cinza.
 *
 * Duas telas, o mesmo assunto, dois desenhos — e o pior dos dois na tela mais importante das duas.
 * Era o mesmo erro que a barra de funções tinha cometido: uma segunda marcação escrita à mão para
 * a mesma coisa, que depois não acompanhou a primeira.
 *
 * AS DUAS FORMAS, e por que são duas funções e não um parâmetro. No HUD a peça inteira é o alvo
 * (clicar nela troca o ativo), então ela É um `<button>`. No modal a peça carrega botões próprios
 * — subir, descer, guardar — e botão dentro de botão não existe em HTML, então ela é um cartão com
 * o nome como alvo. A diferença é de ESTRUTURA, não de aparência, e uma bandeira `como: 'botão' |
 * 'cartão'` esconderia justamente isso. O miolo, que é a aparência, é compartilhado.
 */
import type { AppContext } from '../app-context.js'
import { displayName } from '../state/log.js'
import { comTipo, el } from './dom.js'
import { spriteThumb } from './sprite-css.js'

/** O que a peça precisa saber. É o recorte comum entre o estado vivo da caçada e o DTO do REST. */
export interface DadosDoSlot {
  readonly speciesName: string
  readonly level: number
  readonly hp: number
  readonly hpMax: number
}

/** Lado do sprite no HUD, onde a coluna é estreita. */
export const LADO_HUD = 32
/** Lado no modal, onde a peça é a única coisa na tela e pode respirar. */
export const LADO_MODAL = 40

/*
 * Os dois cortes do medidor. Acima de METADE está inteiro, abaixo de UM QUINTO está crítico — e é
 * a cor que diz, não o número: quem varre seis slots não lê seis frações.
 */
const CORTE_FERIDO = 0.5
const CORTE_CRITICO = 0.2

const estadoDoHp = (hp: number, hpMax: number): string => {
  const fracao = hpMax > 0 ? hp / hpMax : 0
  if (fracao > CORTE_FERIDO) return 'ok'
  return fracao > CORTE_CRITICO ? 'ferido' : 'critico'
}

/** Poço do retrato mais a coluna de dados: é o que as duas formas têm igual. */
function miolo(ctx: AppContext, pokemon: DadosDoSlot, lado: number): readonly HTMLElement[] {
  const especie = ctx.registry.species.get(pokemon.speciesName)
  const tipos = especie?.types ?? []
  const hp = el('progress', { class: 'hp-bar', max: String(pokemon.hpMax), value: String(pokemon.hp) })
  hp.setAttribute('data-hp-state', estadoDoHp(pokemon.hp, pokemon.hpMax))
  return [
    // O sprite mora num POÇO — caixa afundada com contorno próprio. É o que transforma a linha
    // numa peça de jogo em vez de um item de lista com uma figurinha ao lado do texto. E o poço
    // leva a cor do TIPO: seis poços de ardósia idêntica não diziam nada de relance.
    comTipo(el('span', { class: 'slot-poco' }, spriteThumb(ctx.atlas, pokemon.speciesName, lado)), tipos),
    el('div', { class: 'slot-dados' },
      el('div', { class: 'slot-linha' },
        el('span', { class: 'slot-nome' }, displayName(pokemon.speciesName)),
        el('span', { class: 'chip chip-nivel' }, `nv ${pokemon.level}`)),
      el('div', { class: 'slot-linha slot-tipos' },
        ...tipos.map((t) => el('span', { class: `chip type type-${t}` }, t))),
      // O número vai DENTRO do trilho, encostado à direita. Embaixo dele era uma terceira linha de
      // texto miúdo por peça, e ninguém liga "14/14" à barra de cima sem contar as linhas.
      el('div', { class: 'slot-medidor' }, hp, el('span', { class: 'slot-hp' }, `${pokemon.hp}/${pokemon.hpMax}`))),
  ]
}

interface Comum {
  readonly ctx: AppContext
  readonly id: string
  readonly pokemon: DadosDoSlot
}

/** A peça do HUD: o alvo é ela inteira, e clicar troca o Pokémon de agora. */
export function slotAlvo(props: Comum & { readonly ativo: boolean; readonly aoClicar: () => void }): HTMLElement {
  const { ctx, pokemon } = props
  const especie = ctx.registry.species.get(pokemon.speciesName)
  const slot = comTipo(el('button', {
    type: 'button',
    class: props.ativo ? 'slot slot-active' : 'slot',
    'data-pokemon': props.id,
    title: `${displayName(pokemon.speciesName)} L${pokemon.level}`,
  }, ...miolo(ctx, pokemon, LADO_HUD)), especie?.types ?? [])
  slot.addEventListener('click', props.aoClicar)
  return slot
}

/**
 * A peça do modal: cartão com um trilho de ações do lado.
 *
 * O NOME É A PORTA PARA A FICHA. Era assim na lista de texto e continua sendo — é onde o jogador
 * já tentava clicar antes de o botão existir.
 */
export function slotCartao(props: Comum & {
  readonly aoAbrirFicha: () => void
  readonly acoes: readonly HTMLElement[]
  /** Marca a peça como a de agora, do mesmo jeito que no HUD. Na mochila, ninguém é o de agora. */
  readonly ativo?: boolean
}): HTMLElement {
  const { ctx, pokemon } = props
  const especie = ctx.registry.species.get(pokemon.speciesName)
  const corpo = miolo(ctx, pokemon, LADO_MODAL)
  const ficha = el('button', {
    type: 'button', class: 'slot-ficha', 'data-ficha': props.id,
    'aria-label': `ver a ficha de ${displayName(pokemon.speciesName)}`,
  }, ...corpo)
  ficha.addEventListener('click', props.aoAbrirFicha)
  return comTipo(el('div', {
    class: props.ativo === true ? 'slot slot-cartao slot-active' : 'slot slot-cartao',
    'data-pokemon': props.id,
  }, ficha, el('div', { class: 'slot-acoes' }, ...props.acoes)), especie?.types ?? [])
}

/**
 * Vaga livre é um SOQUETE, não a palavra "vazio".
 *
 * Repetir a palavra três vezes é ruído: a informação ("cabe mais um aqui") é a mesma nas três, e
 * texto repetido cobra leitura toda vez. Um encaixe afundado diz isso de forma, e forma repetida
 * não cansa — é o que faz uma fileira de encaixes ler como capacidade em vez de lista de nadas.
 */
export function vagaLivre(): HTMLElement {
  return el('div', { class: 'slot slot-empty', title: 'vaga livre' }, el('span', { class: 'soquete' }))
}

/** A vaga travada diz o NÍVEL que a abre: é informação, e substitui o cadeado em emoji de antes. */
export function vagaTravada(nivel: number | null): HTMLElement {
  return el('div', {
    class: 'slot slot-locked',
    title: nivel === null ? 'vaga indisponível' : `destrava no nível ${nivel} do treinador`,
  }, el('span', { class: 'soquete soquete-travado' }),
    el('span', {}, nivel === null ? 'indisponível' : `nv ${nivel}`))
}
