import { z } from 'zod'
import type { AppContext, ModalName } from '../../app-context.js'
import { MODAL_LABELS } from '../../config.js'
import { trainerProgress } from '../../state/progress.js'
import { el, pct } from '../dom.js'
import { intentButton } from './intent-button.js'

const CONN_TEXT: Readonly<Record<string, string>> = { open: 'conectado', connecting: 'conectando', reconnecting: 'reconectando', closed: 'desconectado' }

/** Treinador, nível com barra de XP, ouro, hunt, tick, conexão e os botões de sair da hunt. */
export function mountTopBar(root: HTMLElement, ctx: AppContext): () => void {
  const name = el('strong', {})
  const level = el('span', { 'data-level': '' })
  const xpBar = el('progress', { class: 'xp-bar', max: '100', value: '0' })
  const nextUnlock = el('span', { class: 'muted', 'data-next': '' })
  const gold = el('span', { 'data-gold': '' }, '0')
  const tick = el('span', { class: 'muted', 'data-tick': '' }, '0')
  const conn = el('span', { class: 'conn', 'data-conn': 'closed' }, CONN_TEXT['closed']!)
  const stop = intentButton('Parar', () => ctx.sendIntent?.({ t: 'hunt.stop' }), ctx)
  const leave = el('button', { type: 'button' }, 'Sair')
  leave.addEventListener('click', () => {
    leave.setAttribute('disabled', '')
    void ctx.http.post('/auth/logout', {}, z.unknown())
      .then(() => ctx.go())
      .finally(() => leave.removeAttribute('disabled'))
  })
  const shortcuts = (Object.keys(MODAL_LABELS) as ModalName[]).map((modal) =>
    el('button', { type: 'button', 'data-open': modal, onclick: () => ctx.openModal?.(modal) }, MODAL_LABELS[modal]))

  root.append(el('header', { class: 'top-bar panel' },
    name, level, xpBar, nextUnlock, el('span', {}, 'ouro:'), gold, el('span', {}, 'tick:'), tick, conn, ...shortcuts, stop, leave))

  const offMe = ctx.session.subscribe((s) => s.me, (me) => {
    if (!me) return
    name.textContent = me.trainer.name
    const progress = trainerProgress(ctx.registry, me.trainer.xp)
    level.textContent = `nível ${progress.level}`
    xpBar.setAttribute('value', String(pct(progress.xpInto, progress.xpSpan)))
    nextUnlock.textContent = progress.next ? `próximo: ${progress.next.what} no nível ${progress.next.level}` : 'tudo destravado'
  })
  const offGold = ctx.hunt.subscribe((v) => v.state?.trainer.gold ?? null, (value) => {
    if (value !== null) gold.textContent = String(value)
  })
  const offTick = ctx.hunt.subscribe((v) => v.tick, (value) => { tick.textContent = String(value) })
  const offConn = ctx.session.subscribe((s) => s.socket, (status) => {
    const phase = ctx.hunt.get().phase
    const key = phase === 'catching-up' ? 'catching-up' : status
    conn.setAttribute('data-conn', key)
    conn.textContent = key === 'catching-up' ? 'recuperando tempo' : CONN_TEXT[status] ?? status
  })
  const offPhase = ctx.hunt.subscribe((v) => v.phase, (phase) => {
    const status = ctx.session.get().socket
    const key = phase === 'catching-up' ? 'catching-up' : status
    conn.setAttribute('data-conn', key)
    conn.textContent = key === 'catching-up' ? 'recuperando tempo' : CONN_TEXT[status] ?? status
  })
  return () => { offMe(); offGold(); offTick(); offConn(); offPhase() }
}
