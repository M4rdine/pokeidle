import { xpForLevel } from '@pokeidle/shared'
import type { AppContext } from '../../app-context.js'
import { activePokemon } from '../../state/hunt-view.js'
import { displayName } from '../../state/log.js'
import { el, pct } from '../dom.js'
import { applySpriteStyle } from '../sprite-css.js'

/** Cartão do Pokémon ativo: sprite, nome, nível, HP e XP até o próximo nível. */
export function mountActivePokemon(root: HTMLElement, ctx: AppContext): () => void {
  const sprite = el('div', { class: 'active-sprite' })
  const title = el('h2', { 'data-name': '' }, '—')
  const hp = el('progress', { class: 'hp-bar', 'data-hp': '', max: '1', value: '0' })
  const hpText = el('span', { class: 'muted', 'data-hp-text': '' }, '0/0')
  const xp = el('progress', { class: 'xp-bar', 'data-xp': '', max: '100', value: '0' })
  root.append(el('section', { class: 'active-card panel' }, sprite, title, hp, hpText, el('span', { class: 'muted' }, 'XP'), xp))

  let species = ''
  return ctx.hunt.subscribe(activePokemon, (active) => {
    if (!active) { title.textContent = '—'; return }
    if (active.speciesName !== species) {
      species = active.speciesName
      sprite.replaceChildren()
      sprite.className = 'active-sprite'
      sprite.removeAttribute('style')
      applySpriteStyle(sprite, ctx.atlas, species)
    }
    title.textContent = `${displayName(active.speciesName)} L${active.level}`
    hp.setAttribute('max', String(active.hpMax))
    hp.setAttribute('value', String(active.hp))
    hpText.textContent = `${active.hp}/${active.hpMax}`
    const growth = ctx.registry.species.get(active.speciesName)?.growthRate ?? 'medium-fast'
    const floor = xpForLevel(growth, active.level)
    const span = xpForLevel(growth, active.level + 1) - floor
    xp.setAttribute('value', String(pct(Math.max(0, active.xp - floor), span)))
  })
}
