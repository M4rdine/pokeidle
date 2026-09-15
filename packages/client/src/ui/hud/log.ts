import type { AppContext } from '../../app-context.js'
import { LOG_MAX_LINES } from '../../config.js'
import type { LogLine } from '../../state/log.js'
import { el } from '../dom.js'

/** Log em português com filtro "só combate"; a lista rola sozinha quando já estava no fim. */
export function mountLog(root: HTMLElement, ctx: AppContext): () => void {
  const list = el('ol', { class: 'log-lines' })
  const filter = el('input', { type: 'checkbox', name: 'combat-only', id: 'log-combat-only' })
  const section = el('section', { class: 'log panel' },
    el('header', { class: 'log-header' }, el('label', { for: 'log-combat-only' }, 'Só combate'), filter),
    list)
  root.append(section)

  const visibleOf = (lines: readonly LogLine[]): readonly LogLine[] =>
    (filter as HTMLInputElement).checked ? lines.filter((line) => line.kind === 'combat') : lines
  const lineNode = (line: LogLine): HTMLElement => el('li', { class: `log-line log-${line.kind}` }, line.text)
  let last: LogLine | null = null

  const rebuild = (lines: readonly LogLine[]): void => {
    const visible = visibleOf(lines)
    last = visible.at(-1) ?? null
    list.replaceChildren(...visible.map(lineNode))
    list.scrollTop = list.scrollHeight
  }
  // O store rotaciona com 200 linhas fixas, então contar não basta: acha a última já desenhada
  // pela identidade do objeto e acrescenta só o que veio depois dela.
  const append = (lines: readonly LogLine[]): void => {
    const visible = visibleOf(lines)
    const from = last === null ? 0 : visible.indexOf(last) + 1
    if (last !== null && from === 0) { rebuild(lines); return } // a última sumiu: refaz
    const fresh = visible.slice(from)
    if (fresh.length === 0) return
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40
    for (const line of fresh) list.append(lineNode(line))
    while (list.children.length > LOG_MAX_LINES) list.firstElementChild?.remove()
    last = visible.at(-1) ?? null
    if (atBottom) list.scrollTop = list.scrollHeight
  }
  filter.addEventListener('change', () => rebuild(ctx.log.get()))
  return ctx.log.subscribe((lines) => lines, append)
}
