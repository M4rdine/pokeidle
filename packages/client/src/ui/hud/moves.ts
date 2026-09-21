import { availableMoves, cooldownTicks } from '@pokeidle/shared'
import type { AppContext } from '../../app-context.js'
import { activePokemon } from '../../state/hunt-view.js'
import { displayName } from '../../state/log.js'
import { el, typeBadge } from '../dom.js'

/** Golpes disponíveis com poder, tipo e quanto falta do cooldown (1 = acabou de usar, 0 = pronto). */
export function mountMoves(root: HTMLElement, ctx: AppContext): () => void {
  const list = el('ul', { class: 'moves' })
  // "poder" sai uma vez, no alto da coluna, em vez de oito vezes — uma por linha. A lista existe
  // para comparar oito golpes, e comparar é ler a MESMA coluna de cima a baixo: repetir o rótulo
  // em cada linha empurra os números para posições diferentes e desfaz justamente a coluna.
  const caixa = el('div', { class: 'moves-caixa panel' },
    el('div', { class: 'cabeca cabeca-barra moves-cabeca' }, el('span', {}, 'Golpes'), el('span', {}, 'poder')),
    list)
  root.append(caixa)
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
          // O rótulo continua existindo para quem ouve a tela: quem lê enxerga a coluna, quem
          // não lê receberia só um número solto.
          el('span', { class: 'move-poder', 'aria-label': `poder ${move.power}` }, String(move.power)),
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
