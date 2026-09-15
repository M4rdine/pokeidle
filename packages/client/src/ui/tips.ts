import type { Event } from '@pokeidle/shared/protocol'
import type { AppContext } from '../app-context.js'
import { TIP_PREFIX } from '../config.js'
import type { HuntView } from '../state/hunt-view.js'
import { ballWarning, tipFor } from '../state/tips.js'

/** Mostra cada dica uma vez por navegador (localStorage) e o aviso de bolas uma vez por sessão. */
export function createTipShower(ctx: AppContext): (event: Event, view: HuntView) => void {
  let warnedAboutBalls = false
  return (event, view) => {
    const tip = tipFor(event, view)
    if (tip && ctx.storage.getItem(TIP_PREFIX + tip.key) === null) {
      ctx.storage.setItem(TIP_PREFIX + tip.key, '1')
      ctx.toasts.show(tip.text, 'big')
    }
    const usedBall = event.type === 'captured' || event.type === 'captureFailed'
    if (!warnedAboutBalls && usedBall && ballWarning(view, ctx.registry)) {
      warnedAboutBalls = true
      ctx.toasts.show('Compre bolas no Centro', 'info')
    }
  }
}
