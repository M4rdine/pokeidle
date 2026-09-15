import type { AppContext, ModalName } from '../../app-context.js'
import { StartHuntSchema } from '../../api/dto.js'
import { HUNT_NAMES, MODAL_LABELS } from '../../config.js'
import { trainerProgress } from '../../state/progress.js'
import { el, mount } from '../dom.js'

const huntName = (id: string, fallback?: string): string => HUNT_NAMES[id] ?? fallback ?? id

/** Lista as hunts liberadas e, abaixo, as futuras com o nível que as destrava. */
export function mountHunts(root: HTMLElement, ctx: AppContext): () => void {
  const { me, hunts } = ctx.session.get()
  const error = el('p', { class: 'form-error', role: 'alert' })

  const start = (id: string, button: HTMLElement): void => {
    error.textContent = ''
    button.setAttribute('disabled', '')
    void ctx.http.post(`/hunts/${id}/start`, {}, StartHuntSchema)
      .then(() => ctx.go())
      .catch((err: unknown) => {
        error.textContent = err instanceof Error ? err.message : 'não foi possível iniciar'
        button.removeAttribute('disabled')
      })
  }
  const available = hunts.map((hunt) => {
    const button = el('button', { class: 'primary', type: 'button' }, 'Iniciar')
    button.addEventListener('click', () => start(hunt.id, button))
    return el('article', { class: 'hunt-card panel', 'data-hunt': hunt.id },
      el('h2', {}, huntName(hunt.id, hunt.name)),
      el('p', { class: 'hunt-levels' }, `níveis ${hunt.minLevel}–${hunt.maxLevel}`),
      button)
  })
  const known = new Set(hunts.map((h) => h.id))
  const locked = Object.entries(ctx.registry.unlocks.hunts)
    .filter(([id]) => !known.has(id))
    .sort((a, b) => a[1] - b[1])
    .map(([id, level]) => el('article', { class: 'hunt-card hunt-locked panel', 'data-hunt': id },
      el('h2', {}, huntName(id)),
      el('p', { class: 'hunt-levels' }, `destrava no nível ${level}`)))

  const progress = me ? trainerProgress(ctx.registry, me.trainer.xp) : null
  const bar = el('header', { class: 'trainer-bar panel' },
    el('strong', {}, me?.trainer.name ?? ''),
    el('span', {}, `nível ${progress?.level ?? 1}`),
    el('span', { 'data-gold': '' }, String(me?.trainer.gold ?? 0)),
    el('span', { class: 'muted' }, progress?.next ? `próximo: ${progress.next.what} no nível ${progress.next.level}` : 'tudo destravado'))

  const shortcuts = el('nav', { class: 'shortcuts' },
    ...(Object.keys(MODAL_LABELS) as ModalName[]).map((name) =>
      el('button', { type: 'button', 'data-open': name, onclick: () => ctx.openModal?.(name) }, MODAL_LABELS[name])))

  mount(root, el('section', { class: 'screen screen-hunts' },
    bar,
    el('h1', {}, 'Hunts'),
    el('div', { class: 'hunt-grid' }, ...available, ...locked),
    shortcuts,
    error))
  return () => { root.replaceChildren() }
}
