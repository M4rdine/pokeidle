/**
 * A mochila.
 *
 * O QUE CAIU: uma lista ALFABÉTICA de todos os itens, separados por fio de cabelo. Com dezesseis
 * itens no registro, "Bola Ninho" caía entre "Bola Repetida" e "Hiper Poção" — três famílias que
 * não têm nada a ver uma com a outra, intercaladas pela letra inicial. Ordem alfabética é o
 * critério de quem não escolheu critério nenhum.
 *
 * Agora são quatro seções, na ordem em que o jogo as usa: bolas (a caçada inteira gira em torno
 * delas), poções, Reviver, pedras. Cada uma com a sua contagem no cabeçalho, como os painéis do
 * HUD — e a família some da tela quando você não tem nenhum item dela, em vez de virar um título
 * vazio.
 */
import { evolutionByItem } from '@pokeidle/shared'
import type { AppContext } from '../../app-context.js'
import { InventorySchema } from '../../api/dto.js'
import { displayName } from '../../state/log.js'
import { activePokemon } from '../../state/hunt-view.js'
import { hasActiveHunt } from '../../state/hunt-active.js'
import { el } from '../dom.js'
import { openModal, type Modal } from './modal.js'

interface NaMochila { readonly itemId: string; readonly quantity: number }

/**
 * As famílias, na ORDEM DE USO e não na alfabética. A bola vem primeiro porque a caçada inteira
 * gira em torno dela; a pedra vem por último porque é o item que se usa uma vez por espécie.
 */
const FAMILIAS = [
  { kind: 'ball', titulo: 'bolas' },
  { kind: 'potion', titulo: 'poções' },
  { kind: 'revive', titulo: 'reviver' },
  { kind: 'stone', titulo: 'pedras' },
] as const

const asList = (inventory: Readonly<Record<string, number>>): NaMochila[] =>
  Object.entries(inventory).filter(([, quantity]) => quantity > 0).map(([itemId, quantity]) => ({ itemId, quantity }))

/** Com hunt ativa a mochila vem do estado espelhado e as poções podem ser usadas; sem hunt, do REST. */
export function openBag(ctx: AppContext): Modal {
  const body = el('div', { class: 'bag' }, el('p', { class: 'muted' }, 'Carregando…'))
  const view = ctx.hunt.get()
  const active = activePokemon(view)
  // `phase` importa: depois de uma parada involuntária o estado continua espelhado na tela.
  const inHunt = hasActiveHunt(ctx) && view.state !== null && view.phase === 'active'

  /** O que este item deixa fazer agora. Fora da caçada, nada: o motor é quem usa item. */
  const acoesDe = (itemId: string, kind: string | undefined): HTMLElement[] => {
    if (!inHunt) return []
    if (kind === 'potion' || kind === 'revive') {
      const cheio = kind === 'potion' && (!active || active.hp >= active.hpMax)
      const usar = el('button', { type: 'button', class: 'discreto', 'data-usar': itemId, ...(cheio && { disabled: true }) }, 'Usar')
      usar.addEventListener('click', () => ctx.sendIntent?.({ t: 'item.use', itemId }))
      return [usar]
    }
    /*
     * A PEDRA lista quem ela evolui, em vez de um botão genérico.
     *
     * O motor recusa a pedra errada e não a gasta — mas deixar o jogador chegar até lá é desenhar
     * o erro e depois defendê-lo. Mostrando só os alvos possíveis, a pedra errada deixa de ser
     * clicável, e o jogador descobre para que ela serve olhando, não errando.
     */
    if (kind === 'stone') {
      const alvos = (ctx.hunt.get().state?.player.team ?? []).flatMap((p) => {
        const especie = ctx.registry.species.get(p.speciesName)
        const destino = especie && evolutionByItem(especie, itemId, ctx.registry)
        return destino ? [{ id: p.id, de: p.speciesName, para: destino.name }] : []
      })
      if (alvos.length === 0) return [el('span', { class: 'muted bag-sem-alvo' }, 'ninguém do time evolui com ela')]
      return alvos.map((a) => {
        const usar = el('button', { type: 'button', class: 'discreto', 'data-alvo': a.id },
          `${displayName(a.de)} → ${displayName(a.para)}`)
        usar.addEventListener('click', () => ctx.sendIntent?.({ t: 'item.use', itemId, pokemonId: a.id }))
        return usar
      })
    }
    return []
  }

  const peca = ({ itemId, quantity }: NaMochila): HTMLElement => {
    const item = ctx.registry.items.get(itemId)
    const acoes = acoesDe(itemId, item?.kind)
    return el('div', { class: 'bag-item', 'data-item': itemId },
      // O sprite oficial num POÇO, como toda figura desta casa. Ele estava solto ao lado do nome,
      // e era o único ícone do jogo sem a caixa que os do menu e os do time têm.
      el('span', { class: 'bag-poco' }, el('span', { class: 'icone-item', 'data-item': itemId, 'aria-hidden': 'true' })),
      el('span', { class: 'bag-nome' }, item?.name ?? itemId),
      // A QUANTIDADE é o dado da mochila, e vinha em cinza de legenda. Ela é o número que decide
      // se dá para continuar caçando.
      el('span', { class: 'bag-conta', 'data-quantity': '' }, `×${quantity}`),
      acoes.length > 0 ? el('div', { class: 'bag-acoes' }, ...acoes) : null)
  }

  /*
   * A ordem do REGISTRO, que é a de poder crescente — Poké, Great, Ultra. Alfabética poria a
   * Master Bola em terceiro e a Ultra em último.
   *
   * O índice é montado UMA vez. Dentro do comparador, ele reconstruía a lista inteira de chaves a
   * cada comparação.
   */
  const ordemNoRegistro = new Map([...ctx.registry.items.keys()].map((id, i) => [id, i]))

  const render = (items: readonly NaMochila[]): void => {
    if (items.length === 0) {
      body.replaceChildren(el('p', { class: 'bag-vazia muted' }, 'Mochila vazia. A Loja vende bolas e poções.'))
      return
    }
    const secoes = FAMILIAS.flatMap(({ kind, titulo }) => {
      const desta = items
        .filter(({ itemId }) => ctx.registry.items.get(itemId)?.kind === kind)
        .sort((a, b) => (ordemNoRegistro.get(a.itemId) ?? 0) - (ordemNoRegistro.get(b.itemId) ?? 0))
      if (desta.length === 0) return []
      const total = desta.reduce((soma, i) => soma + i.quantity, 0)
      return [el('section', { class: 'bag-familia', 'data-familia': kind },
        el('div', { class: 'cabeca cabeca-barra' }, el('span', {}, titulo), el('span', { class: 'cabeca-conta' }, String(total))),
        el('div', { class: 'bag-lista' }, ...desta.map(peca)))]
    })
    // Uma família que o registro não conhece não pode sumir da tela sem aviso: ela cai aqui.
    const conhecidos = new Set(FAMILIAS.map((f) => f.kind))
    const soltos = items.filter(({ itemId }) => !conhecidos.has((ctx.registry.items.get(itemId)?.kind ?? '') as never))
    if (soltos.length > 0) {
      secoes.push(el('section', { class: 'bag-familia', 'data-familia': 'outros' },
        el('div', { class: 'cabeca cabeca-barra' }, el('span', {}, 'outros')),
        el('div', { class: 'bag-lista' }, ...soltos.map(peca))))
    }
    body.replaceChildren(...secoes)
  }

  if (inHunt) render(asList(view.state!.inventory))
  // Sem este ramo, falha de rede virava "Mochila vazia" — e quem lê isso acha que perdeu os itens.
  else {
    void ctx.http.get('/trainer/inventory', InventorySchema)
      .then((r) => render(r.items))
      .catch(() => body.replaceChildren(el('p', { class: 'form-error', role: 'alert' }, 'não foi possível carregar a mochila')))
  }
  return openModal(document.body, 'Mochila', body)
}
