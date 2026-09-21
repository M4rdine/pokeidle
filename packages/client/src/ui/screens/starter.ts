import type { AppContext } from '../../app-context.js'
import { StarterResponseSchema } from '../../api/dto.js'
import { displayName } from '../../state/log.js'
import { el, mount, typeBadge } from '../dom.js'
import { spriteThumb } from '../sprite-css.js'

export const STARTERS = ['charmander', 'bulbasaur', 'squirtle'] as const
const STARTER_LEVEL = 10

/** Três cartões com sprite, tipos e nível; escolher é irreversível (o servidor recusa a segunda). */
/** Lado do sprite do inicial, em pixels: ele é o assunto da tela. */
const LADO_INICIAL = 64

export function mountStarter(root: HTMLElement, ctx: AppContext): () => void {
  const error = el('p', { class: 'form-error', role: 'alert' })
  const choose = (species: string, button: HTMLElement): void => {
    error.textContent = ''
    button.setAttribute('disabled', '')
    void ctx.http.post('/trainer/starter', { species }, StarterResponseSchema)
      .then(() => ctx.go())
      .catch((err: unknown) => {
        error.textContent = err instanceof Error ? err.message : 'não foi possível escolher'
        button.removeAttribute('disabled')
      })
  }
  const card = (species: string): HTMLElement => {
    const sprite = el('div', { class: 'starter-sprite' }, spriteThumb(ctx.atlas, species, LADO_INICIAL))
    const button = el('button', { class: 'primary', type: 'button' }, 'Escolher')
    button.addEventListener('click', () => choose(species, button))
    const types = ctx.registry.species.get(species)?.types ?? []
    return el('article', { class: 'starter-card panel', 'data-species': species },
      sprite,
      el('h2', {}, displayName(species)),
      el('p', { class: 'types' }, ...types.map(typeBadge)),
      el('p', { class: 'level' }, `Nível ${STARTER_LEVEL}`),
      button)
  }
  mount(root, el('section', { class: 'screen screen-starter' },
    el('h1', {}, 'Escolha seu inicial'),
    el('div', { class: 'starter-grid' }, ...STARTERS.map(card)),
    error))
  return () => { root.replaceChildren() }
}
