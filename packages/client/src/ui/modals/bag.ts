import { evolutionByItem } from '@pokeidle/shared'
import type { AppContext } from '../../app-context.js'
import { InventorySchema } from '../../api/dto.js'
import { displayName } from '../../state/log.js'
import { activePokemon } from '../../state/hunt-view.js'
import { hasActiveHunt } from '../../state/hunt-active.js'
import { el } from '../dom.js'
import { openModal, type Modal } from './modal.js'

const asList = (inventory: Readonly<Record<string, number>>): { itemId: string; quantity: number }[] =>
  Object.entries(inventory).filter(([, quantity]) => quantity > 0).map(([itemId, quantity]) => ({ itemId, quantity })).sort((a, b) => a.itemId.localeCompare(b.itemId))

/** Com hunt ativa a mochila vem do estado espelhado e as poções podem ser usadas; sem hunt, do REST. */
export function openBag(ctx: AppContext): Modal {
  const body = el('div', { class: 'bag' }, el('p', { class: 'muted' }, 'Carregando…'))
  const view = ctx.hunt.get()
  const active = activePokemon(view)
  // `phase` importa: depois de uma parada involuntária o estado continua espelhado na tela.
  const inHunt = hasActiveHunt(ctx) && view.state !== null && view.phase === 'active'

  const render = (items: readonly { itemId: string; quantity: number }[]): void => {
    if (items.length === 0) { body.replaceChildren(el('p', { class: 'muted' }, 'Mochila vazia')); return }
    body.replaceChildren(...items.map(({ itemId, quantity }) => {
      const item = ctx.registry.items.get(itemId)
      const row = el('div', { class: 'bag-item', 'data-item': itemId },
        el('span', { class: 'icone-item', 'data-item': itemId, 'aria-hidden': 'true' }),
        el('span', { class: 'bag-nome' }, item?.name ?? itemId),
        el('span', { class: 'muted', 'data-quantity': '' }, `×${quantity}`))
      if (inHunt && item?.kind === 'potion') {
        const full = !active || active.hp >= active.hpMax
        const use = el('button', { type: 'button', ...(full && { disabled: true }) }, 'Usar')
        use.addEventListener('click', () => ctx.sendIntent?.({ t: 'item.use', itemId }))
        row.append(use)
      }
      /*
       * A PEDRA lista quem ela evolui, em vez de um botão genérico.
       *
       * O motor recusa a pedra errada e não a gasta — mas deixar o jogador chegar até lá é
       * desenhar o erro e depois defendê-lo. Mostrando só os alvos possíveis, a pedra errada
       * deixa de ser clicável, e o jogador descobre o que ela serve olhando, não errando.
       */
      if (inHunt && item?.kind === 'stone') {
        const time = ctx.hunt.get().state?.player.team ?? []
        const alvos = time.filter((p) => {
          const especie = ctx.registry.species.get(p.speciesName)
          return especie !== undefined && evolutionByItem(especie, itemId, ctx.registry) !== undefined
        })
        if (alvos.length === 0) {
          row.append(el('span', { class: 'muted bag-sem-alvo' }, 'ninguém do time evolui com ela'))
        } else {
          row.append(el('div', { class: 'bag-alvos' }, ...alvos.map((p) => {
            const especie = ctx.registry.species.get(p.speciesName)!
            const destino = evolutionByItem(especie, itemId, ctx.registry)!
            const usar = el('button', { type: 'button', 'data-alvo': p.id },
              `${displayName(p.speciesName)} → ${displayName(destino.name)}`)
            usar.addEventListener('click', () => ctx.sendIntent?.({ t: 'item.use', itemId, pokemonId: p.id }))
            return usar
          })))
        }
      }
      return row
    }))
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
