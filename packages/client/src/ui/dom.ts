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
export const pct = (value: number, total: number): number => (total <= 0 ? 0 : Math.round((100 * value) / total))
