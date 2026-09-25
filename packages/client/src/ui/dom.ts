type Attr = string | boolean | ((ev: Event) => void)

/** Cria um elemento: chaves `on*` viram listeners, `true` vira atributo vazio, `false` não escreve nada. */
export function el(tag: string, attrs: Record<string, Attr> = {}, ...children: (Node | string | null)[]): HTMLElement {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === 'function') node.addEventListener(key.slice(2), value)
    else if (value === true) node.setAttribute(key, '')
    else if (value !== false) node.setAttribute(key, value)
  }
  for (const child of children) if (child !== null) node.append(child)
  return node
}

export const clear = (node: Element): void => { while (node.firstChild) node.firstChild.remove() }
export const mount = (root: Element, node: Node): void => { clear(root); root.append(node) }
export const typeBadge = (type: string): HTMLElement => el('span', { class: `type type-${type}` }, type)

/**
 * Empresta a cor do TIPO à peça, como `--tipo`.
 *
 * A tese deste design system é que o design do Pokémon já existe e está nos selos de tipo. O HUD
 * declarava isso e não fazia: dezoito matizes saturados moravam nos tokens e apareciam só em
 * pílulas de 11 px, enquanto seis slots de time, os golpes e os marcadores do mapa eram seis
 * retângulos de ardósia idênticos. Era o sistema optando por não usar o seu próprio motivo.
 *
 * Isto não acrescenta cor nenhuma — os dezoito já são token. Só leva a que já existe para onde
 * ela identifica: o poço do retrato, o trilho do golpe, o disco do marcador.
 */
export function comTipo<T extends HTMLElement>(node: T, tipos: readonly string[]): T {
  const primeiro = tipos[0]
  if (primeiro === undefined) return node
  node.style.setProperty('--tipo', `var(--type-${primeiro})`)
  // O segundo tipo entra num gradiente de duas paradas. Quem tem um tipo só fica com o mesmo dos
  // dois lados, e a regra do CSS não precisa saber a diferença.
  node.style.setProperty('--tipo-2', `var(--type-${tipos[1] ?? primeiro})`)
  return node
}
export const pct = (value: number, total: number): number => (total <= 0 ? 0 : Math.round((100 * value) / total))

/**
 * Acusa que um valor mudou, com um pulso curto.
 *
 * A CLASSE NÃO PODE FICAR. Estes elementos se reescrevem a cada tique de 200 ms, e uma animação
 * presa neles reiniciaria para sempre — o número ficaria pulsando eternamente em vez de pulsar
 * quando muda. Tirar no `animationend` devolve o elemento ao estado normal e deixa o próximo
 * pulso disparar do zero.
 *
 * Reaplicar enquanto a anterior roda também não serve: o navegador ignora a classe que já está
 * lá. Tirar antes de pôr, e forçar o reflow entre as duas, é o que faz o segundo pulso acontecer.
 */
export function pulsar(node: HTMLElement): void {
  node.classList.remove('pulsa')
  void node.offsetWidth
  node.classList.add('pulsa')
  node.addEventListener('animationend', () => node.classList.remove('pulsa'), { once: true })
}

/**
 * Escreve um texto e pulsa só se ele MUDOU.
 *
 * Sem a comparação, o pulso dispararia a cada tique mesmo com o valor parado — que é o oposto do
 * que ele existe para dizer.
 */
export function escreverComPulso(node: HTMLElement, texto: string): void {
  if (node.textContent === texto) return
  const primeiraVez = node.textContent === '' || node.textContent === null
  node.textContent = texto
  // Na primeira escrita não há mudança nenhuma a acusar: o valor está nascendo, não subindo.
  if (!primeiraVez) pulsar(node)
}
