import { availableMoves, cooldownTicks } from '@pokeidle/shared'
import type { AppContext } from '../../app-context.js'
import { activePokemon } from '../../state/hunt-view.js'
import { displayName } from '../../state/log.js'
import { el, typeBadge } from '../dom.js'

/** Golpes disponíveis com poder, tipo e quanto falta do cooldown (1 = acabou de usar, 0 = pronto). */
export function mountMoves(root: HTMLElement, ctx: AppContext): () => void {
  const list = el('ul', { class: 'moves panel' })
  root.append(list)
  let rendered = ''

  const render = (): void => {
    const active = activePokemon(ctx.hunt.get())
    const species = active ? ctx.registry.species.get(active.speciesName) : undefined
    const moves = active && species ? availableMoves(species, active.level, ctx.registry.moves) : []
    const key = moves.map((m) => m.name).join(',')
    if (key !== rendered) {
      rendered = key
      list.replaceChildren(...moves.map((move) =>
        el('li', { class: 'move', 'data-move': move.name },
          el('span', { class: 'move-name' }, displayName(move.name)),
          typeBadge(move.type),
          el('span', { class: 'muted' }, `poder ${move.power}`),
          el('span', { class: 'move-cd', 'data-cd': '0' }))))
    }
    const { tick, derived } = ctx.hunt.get()
    for (const move of moves) {
      const node = list.querySelector(`[data-move="${move.name}"] .move-cd`)
      if (!node) continue
      const total = cooldownTicks(move)
      const left = Math.max(0, (derived.cooldownUntil[move.name] ?? 0) - tick)
      const fraction = total > 0 ? Math.min(1, left / total) : 0
      node.setAttribute('data-cd', String(fraction))
      // A barra encolhe junto com o cooldown (o CSS lê --cd); `data-cd` fica para os testes.
      ;(node as HTMLElement).style.setProperty('--cd', String(fraction))
    }
  }
  const offActive = ctx.hunt.subscribe(activePokemon, render)
  const offTick = ctx.hunt.subscribe((v) => v.tick, render)
  const offCd = ctx.hunt.subscribe((v) => v.derived.cooldownUntil, render)
  return () => { offActive(); offTick(); offCd() }
}
