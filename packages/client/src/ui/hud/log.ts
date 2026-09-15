import type { AppContext } from '../../app-context.js'
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

  const render = (lines: readonly LogLine[]): void => {
    const onlyCombat = (filter as HTMLInputElement).checked
    const visible = onlyCombat ? lines.filter((l) => l.kind === 'combat') : lines
    const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40
    list.replaceChildren(...visible.map((line) => el('li', { class: `log-line log-${line.kind}` }, line.text)))
    if (atBottom) list.scrollTop = list.scrollHeight
  }
  filter.addEventListener('change', () => render(ctx.log.get()))
  return ctx.log.subscribe((lines) => lines, render)
}
