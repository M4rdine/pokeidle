import type { AppContext } from '../../app-context.js'
import { StartHuntSchema } from '../../api/dto.js'
import { stopReasonText } from '../../state/log.js'
import { el } from '../dom.js'
import { showOverlay } from '../overlay.js'

/** Catch-up com progresso, resumo em toast e a sobreposição de hunt parada com "Iniciar de novo". */
export function mountOverlays(root: HTMLElement, ctx: AppContext): () => void {
  let hide: (() => void) | null = null
  let catchupTotal = 0
  const clear = (): void => { hide?.(); hide = null }

  const offPhase = ctx.hunt.subscribe((v) => ({ phase: v.phase, remaining: v.catchup?.remaining ?? null, stopped: v.stoppedInfo }), (state) => {
    clear()
    if (state.phase === 'catching-up') {
      const remaining = state.remaining ?? 0
      // O primeiro valor visto vira o denominador: o servidor só manda quanto falta.
      catchupTotal = Math.max(catchupTotal, remaining)
      const done = catchupTotal > 0 ? 1 - remaining / catchupTotal : 0
      hide = showOverlay(root, el('div', { class: 'catchup' },
        el('h2', {}, 'Recuperando o tempo offline'),
        el('progress', { max: '1', value: done.toFixed(3) }),
        el('p', { 'data-remaining': '' }, `${remaining} ticks restantes`)))
      return
    }
    catchupTotal = 0
    if (state.phase === 'stopped' && state.stopped) {
      const again = el('button', { class: 'primary', type: 'button' }, 'Iniciar de novo')
      again.addEventListener('click', () => {
        const huntId = ctx.hunt.get().session?.huntId ?? ctx.session.get().me?.trainer.activeHuntId
        if (!huntId) return
        again.setAttribute('disabled', '')
        void ctx.http.post(`/hunts/${huntId}/start`, {}, StartHuntSchema).then(() => ctx.go()).finally(() => again.removeAttribute('disabled'))
      })
      const back = el('button', { type: 'button' }, 'Voltar')
      back.addEventListener('click', () => { void ctx.go() })
      hide = showOverlay(root, el('div', { class: 'stopped' },
        el('h2', {}, 'Hunt parada'),
        el('p', {}, stopReasonText(state.stopped.reason, state.stopped.healed)),
        el('p', {}, again, back)))
    }
  }, { equals: (a, b) => a.phase === b.phase && a.remaining === b.remaining && a.stopped === b.stopped })

  const offSummary = ctx.hunt.subscribe((v) => v.lastSummary, (summary) => {
    if (!summary) return
    ctx.toasts.show(`Catch-up: ${summary.ticks} ticks, ${summary.defeats} derrotas, ${summary.captures} capturas, +${summary.xpTrainer} XP, +${summary.gold} ouro`, 'big')
  }, { immediate: false })

  return () => { clear(); offPhase(); offSummary() }
}
