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
