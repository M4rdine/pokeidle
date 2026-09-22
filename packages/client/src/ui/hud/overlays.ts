import type { AppContext } from '../../app-context.js'
import { StartHuntSchema } from '../../api/dto.js'
import { stopReasonText } from '../../state/log.js'
import { el } from '../dom.js'
import { showOverlay } from '../overlay.js'
import { painelDeRetorno } from './retorno.js'

/**
 * Catch-up com progresso, painel de volta e a sobreposição de hunt parada com "Iniciar de novo".
 *
 * DUAS sobreposições, com desligamento separado, e não uma só. O servidor manda `hunt.summary` e
 * logo em seguida o snapshot; o snapshot muda a fase para `active`, e com um slot compartilhado a
 * troca de fase apagava o painel de volta no mesmo quadro em que ele aparecia — a tela de
 * pagamento do jogo piscava e sumia. A de fase é do servidor e troca sozinha; a de volta é do
 * jogador e só fecha no botão dele.
 */
export function mountOverlays(root: HTMLElement, ctx: AppContext): () => void {
  let hide: (() => void) | null = null
  let hideRetorno: (() => void) | null = null
  let catchupTotal = 0
  const clear = (): void => { hide?.(); hide = null }
  const clearRetorno = (): void => { hideRetorno?.(); hideRetorno = null }

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

  /*
   * O resumo do tempo offline vira PAINEL, não toast.
   *
   * Num idle esta é a tela de pagamento — a única que responde "valeu a pena deixar rodando?" — e
   * ela estava numa linha que sumia sozinha em segundos, começando por "N ticks". Quem voltasse
   * depois de uma noite e olhasse a aba um instante tarde demais não via nada do que ganhou.
   *
   * Por ser sobreposição, ela também espera o jogador: fecha no botão, não no relógio.
   */
  const offSummary = ctx.hunt.subscribe((v) => v.lastSummary, (summary) => {
    if (!summary) return
    clearRetorno()
    hideRetorno = showOverlay(root, painelDeRetorno(summary, {
      nomeDoItem: (id) => ctx.registry.items.get(id)?.name ?? id,
      aoFechar: clearRetorno,
    }))
  }, { immediate: false })

  return () => { clear(); clearRetorno(); offPhase(); offSummary() }
}
