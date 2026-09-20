import type { AppContext, ModalName } from '../../app-context.js'
import { StartHuntSchema } from '../../api/dto.js'
import { MODAL_LABELS } from '../../config.js'
import { trainerProgress } from '../../state/progress.js'
import { el, mount } from '../dom.js'

/** Lista as áreas do treinador: as liberadas com botão, as bloqueadas com o nível que as abre. */
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
  // Área bloqueada continua na lista, esmaecida e sem botão: saber o que vem depois faz parte do
  // jogo, e é o servidor que decide o bloqueio — o cliente só desenha o que recebeu.
  const cartao = (hunt: (typeof hunts)[number]) => {
    const faixa = el('p', { class: 'hunt-levels' }, `níveis ${hunt.minLevel}–${hunt.maxLevel}`)
    if (hunt.locked) {
      return el('article', { class: 'hunt-card hunt-locked panel', 'data-hunt': hunt.id },
        el('h2', {}, hunt.name),
        faixa,
        el('p', { class: 'hunt-gate' }, `abre no nível ${hunt.minTrainerLevel}`))
    }
    const button = el('button', { class: 'primary', type: 'button' }, 'Iniciar')
    button.addEventListener('click', () => start(hunt.id, button))
    return el('article', { class: 'hunt-card panel', 'data-hunt': hunt.id }, el('h2', {}, hunt.name), faixa, button)
  }
  // Ordem de dificuldade: o que já dá para jogar primeiro, o resto na sequência em que abre.
  const cartoes = [...hunts]
    .sort((a, b) => Number(a.locked) - Number(b.locked) || a.minTrainerLevel - b.minTrainerLevel)
    .map(cartao)

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
    el('div', { class: 'hunt-grid' }, ...cartoes),
    shortcuts,
    error))
  return () => { root.replaceChildren() }
}
