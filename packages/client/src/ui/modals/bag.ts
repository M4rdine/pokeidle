import type { AppContext } from '../../app-context.js'
import { InventorySchema } from '../../api/dto.js'
import { activePokemon } from '../../state/hunt-view.js'
import { el } from '../dom.js'
import { openModal, type Modal } from './modal.js'

const asList = (inventory: Readonly<Record<string, number>>): { itemId: string; quantity: number }[] =>
  Object.entries(inventory).filter(([, quantity]) => quantity > 0).map(([itemId, quantity]) => ({ itemId, quantity })).sort((a, b) => a.itemId.localeCompare(b.itemId))

/** Com hunt ativa a mochila vem do estado espelhado e as poções podem ser usadas; sem hunt, do REST. */
export function openBag(ctx: AppContext): Modal {
  const body = el('div', { class: 'bag' }, el('p', { class: 'muted' }, 'Carregando…'))
  const view = ctx.hunt.get()
  const active = activePokemon(view)
  const inHunt = view.state !== null

  const render = (items: readonly { itemId: string; quantity: number }[]): void => {
    if (items.length === 0) { body.replaceChildren(el('p', { class: 'muted' }, 'Mochila vazia')); return }
    body.replaceChildren(...items.map(({ itemId, quantity }) => {
      const item = ctx.registry.items.get(itemId)
      const row = el('div', { class: 'bag-item', 'data-item': itemId },
        el('span', {}, item?.name ?? itemId),
        el('span', { class: 'muted', 'data-quantity': '' }, `×${quantity}`))
      if (inHunt && item?.kind === 'potion') {
        const full = !active || active.hp >= active.hpMax
        const use = el('button', { type: 'button', ...(full && { disabled: true }) }, 'Usar')
        use.addEventListener('click', () => ctx.sendIntent?.({ t: 'item.use', itemId }))
        row.append(use)
      }
      return row
    }))
  }

  if (inHunt) render(asList(view.state!.inventory))
  else void ctx.http.get('/trainer/inventory', InventorySchema).then((r) => render(r.items)).catch(() => render([]))
  return openModal(document.body, 'Mochila', body)
}
