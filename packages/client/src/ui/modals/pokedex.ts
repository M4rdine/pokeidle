import type { AppContext } from '../../app-context.js'
import { PokedexSchema, type PokedexEntry } from '../../api/dto.js'
import { displayName } from '../../state/log.js'
import { el } from '../dom.js'
import { applySpriteStyle } from '../sprite-css.js'
import { openModal, type Modal } from './modal.js'

/** Todas as espécies do registro: capturadas, vistas e desconhecidas (estas sem sprite nem nome). */
export function openPokedex(ctx: AppContext): Modal {
  const body = el('div', { class: 'pokedex' }, el('p', { class: 'muted' }, 'Carregando…'))

  const render = (entries: readonly PokedexEntry[]): void => {
    const byName = new Map(entries.map((entry) => [entry.speciesName, entry]))
    const seenInSession = new Set(ctx.hunt.get().state?.settings.seen ?? [])
    const species = [...ctx.registry.species.values()].sort((a, b) => a.id - b.id)
    const caught = species.filter((s) => byName.get(s.name)?.caughtAt != null || seenInSession.has(s.name)).length
    const seen = species.filter((s) => byName.has(s.name) || seenInSession.has(s.name)).length
    body.replaceChildren(
      el('p', { class: 'muted' }, `Capturados: ${caught} · Vistos: ${seen} · Total: ${species.length}`),
      el('div', { class: 'pokedex-grid' }, ...species.map((one) => {
        const entry = byName.get(one.name)
        const isCaught = entry?.caughtAt != null || seenInSession.has(one.name)
        const isSeen = entry !== undefined || isCaught
        const cell = el('div', { class: `dex-cell ${isCaught ? 'caught' : isSeen ? 'seen' : 'unknown'}`, 'data-species': one.name })
        if (isSeen) {
          const sprite = el('div', { class: 'dex-sprite' })
          applySpriteStyle(sprite, ctx.atlas, one.name)
          cell.append(sprite, el('span', {}, displayName(one.name)))
        } else cell.append(el('span', { class: 'muted' }, '???'))
        return cell
      })))
  }

  void ctx.http.get('/trainer/pokedex', PokedexSchema)
    .then((data) => render(data.entries))
    .catch(() => body.replaceChildren(el('p', { class: 'form-error' }, 'não foi possível carregar a Pokédex')))
  return openModal(document.body, 'Pokédex', body)
}
