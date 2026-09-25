import type { AppContext } from '../../app-context.js'
import { ShopSchema, TradeSchema, type ShopItem } from '../../api/dto.js'
import { hasActiveHunt } from '../../state/hunt-active.js'
import { el } from '../dom.js'
import { openModal, type Modal } from './modal.js'

/** Loja do Centro: comprar e vender só fora de hunt (o servidor recusa com hunt ativa). */
export function openShop(ctx: AppContext): Modal {
  const body = el('div', { class: 'shop' }, el('p', { class: 'muted' }, 'Carregando…'))
  const error = el('p', { class: 'form-error', role: 'alert' })
  const inHunt = hasActiveHunt(ctx)

  const reload = (): void => {
    void ctx.http.get('/shop', ShopSchema).then(render).catch(() => {
      body.replaceChildren(el('p', { class: 'form-error' }, 'não foi possível carregar a loja'))
    })
  }
  /**
   * O botão trava enquanto a requisição está no ar. Sem isso, dois cliques rápidos viravam duas
   * compras — e o jogador só descobria pelo ouro que sumiu.
   */
  const trade = (path: '/shop/buy' | '/shop/sell', itemId: string, quantity: number, botao: HTMLElement): void => {
    error.textContent = ''
    botao.setAttribute('disabled', '')
    void ctx.http.post(path, { itemId, quantity }, TradeSchema)
      .then(() => { reload(); return ctx.go() })
      .catch((err: unknown) => { error.textContent = err instanceof Error ? err.message : 'não foi possível concluir' })
      .finally(() => botao.removeAttribute('disabled'))
  }
  const row = (item: ShopItem): HTMLElement => {
    const quantity = el('input', { type: 'number', min: '1', max: '99', value: '1', 'aria-label': `quantidade de ${item.name}` })
    const amount = (): number => Math.min(99, Math.max(1, Number((quantity as HTMLInputElement).value) || 1))
    /*
     * COMPRAR NÃO É `primary`. O vermelho da Poké Ball é a única cor de marca do sistema e existe
     * para a ação principal de uma TELA — seis deles empilhados numa lista fazem a loja gritar e
     * gastam a cor que deveria significar "é isto que se faz aqui". A hierarquia entre comprar e
     * vender sai do peso: comprar é a peça levantada de sempre, vender é discreta.
     */
    const buy = el('button', { type: 'button', ...((!item.unlocked || inHunt) && { disabled: true }) }, 'Comprar')
    const sell = el('button', { type: 'button', class: 'discreto', ...((item.owned === 0 || inHunt) && { disabled: true }) }, 'Vender')
    buy.addEventListener('click', () => trade('/shop/buy', item.itemId, amount(), buy))
    sell.addEventListener('click', () => trade('/shop/sell', item.itemId, amount(), sell))
    /*
     * A linha da loja tinha quatro textos soltos em cinza — nome, "200 ouro", a quantidade que se
     * tem, e dois botões iguais — e nada dizia qual deles é o assunto. Agora ela tem COLUNAS com
     * papéis: o nome é o dado, o preço é dinheiro (e dinheiro leva a cor do ouro, como no resto do
     * jogo), o que já se tem é um selo, e COMPRAR é a ação primária porque é para isso que se
     * abre uma loja. Vender continua existindo, em voz secundária.
     */
    return el('div', { class: `shop-item${item.unlocked ? '' : ' locked'}`, 'data-item': item.itemId },
      el('span', { class: 'shop-name' }, item.name),
      el('span', { class: 'moeda moeda-ouro shop-preco' },
        el('span', { class: 'moeda-valor' }, item.buyPrice.toLocaleString('pt-BR')),
        el('span', { class: 'muted' }, 'ouro')),
      // O ATRIBUTO carrega o valor; o texto carrega a apresentação. O smoke lia o número do texto
      // exibido e quebrou no dia em que ele virou `×1` — contrato de máquina não pode depender de
      // como o número é escrito para gente.
      el('span', { class: 'chip shop-tenho', 'data-owned': String(item.owned), title: `você tem ${item.owned}` },
        `×${item.owned.toLocaleString('pt-BR')}`),
      item.unlocked ? quantity : el('span', { class: 'chip shop-trava' }, `nv ${item.unlockLevel}`),
      ...(item.unlocked ? [buy, sell] : []))
  }
  function render(shop: { level: number; gold: number; items: readonly ShopItem[] }): void {
    body.replaceChildren(
      // O saldo é o número que decide toda a tela: sai de texto corrido para a mesma leitura
      // rotulada do resto do jogo, com separador de milhar e na cor do ouro. Ele vinha cru —
      // "Ouro: 1428407" — numa aplicação onde todo outro número já é formatado.
      el('div', { class: 'shop-saldo' },
        el('div', { class: 'leitura leitura-ouro' },
          el('span', {}, 'seu ouro'),
          el('span', { 'data-gold': '' }, shop.gold.toLocaleString('pt-BR'))),
        el('div', { class: 'leitura' },
          el('span', {}, 'nível'),
          el('span', {}, String(shop.level)))),
      ...(inHunt ? [el('p', { class: 'form-error' }, 'pare a hunt para usar a loja')] : []),
      ...shop.items.map(row),
      error)
  }
  reload()
  return openModal(document.body, 'Loja', body)
}
