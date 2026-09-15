import type { AppContext } from '../../app-context.js'
import { ShopSchema, TradeSchema, type ShopItem } from '../../api/dto.js'
import { el } from '../dom.js'
import { openModal, type Modal } from './modal.js'

/** Loja do Centro: comprar e vender só fora de hunt (o servidor recusa com hunt ativa). */
export function openShop(ctx: AppContext): Modal {
  const body = el('div', { class: 'shop' }, el('p', { class: 'muted' }, 'Carregando…'))
  const error = el('p', { class: 'form-error', role: 'alert' })
  const inHunt = ctx.hunt.get().state !== null

  const reload = (): void => {
    void ctx.http.get('/shop', ShopSchema).then(render).catch(() => {
      body.replaceChildren(el('p', { class: 'form-error' }, 'não foi possível carregar a loja'))
    })
  }
  const trade = (path: '/shop/buy' | '/shop/sell', itemId: string, quantity: number): void => {
    error.textContent = ''
    void ctx.http.post(path, { itemId, quantity }, TradeSchema)
      .then(() => { reload(); return ctx.go() })
      .catch((err: unknown) => { error.textContent = err instanceof Error ? err.message : 'não foi possível concluir' })
  }
  const row = (item: ShopItem): HTMLElement => {
    const quantity = el('input', { type: 'number', min: '1', max: '99', value: '1', 'aria-label': `quantidade de ${item.name}` })
    const amount = (): number => Math.min(99, Math.max(1, Number((quantity as HTMLInputElement).value) || 1))
    const buy = el('button', { type: 'button', ...((!item.unlocked || inHunt) && { disabled: true }) }, 'Comprar')
    const sell = el('button', { type: 'button', ...((item.owned === 0 || inHunt) && { disabled: true }) }, 'Vender')
    buy.addEventListener('click', () => trade('/shop/buy', item.itemId, amount()))
    sell.addEventListener('click', () => trade('/shop/sell', item.itemId, amount()))
    return el('div', { class: `shop-item${item.unlocked ? '' : ' locked'}`, 'data-item': item.itemId },
      el('span', { class: 'shop-name' }, item.name),
      el('span', { class: 'muted' }, `${item.buyPrice} ouro`),
      el('span', { class: 'muted', 'data-owned': '' }, String(item.owned)),
      item.unlocked ? quantity : el('span', { class: 'muted' }, `nível ${item.unlockLevel}`),
      ...(item.unlocked ? [buy, sell] : []))
  }
  function render(shop: { level: number; gold: number; items: readonly ShopItem[] }): void {
    body.replaceChildren(
      el('p', {}, `Ouro: `, el('strong', { 'data-gold': '' }, String(shop.gold)), ` · nível ${shop.level}`),
      ...(inHunt ? [el('p', { class: 'form-error' }, 'pare a hunt para usar a loja')] : []),
      ...shop.items.map(row),
      error)
  }
  reload()
  return openModal(document.body, 'Loja', body)
}
