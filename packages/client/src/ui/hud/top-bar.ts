import { findArea } from '@pokeidle/shared'
import { z } from 'zod'
import type { AppContext, ModalName } from '../../app-context.js'
import { MODAL_LABELS } from '../../config.js'
import { PokedexSchema } from '../../api/dto.js'
import { trainerProgress } from '../../state/progress.js'
import { huntPokedexCount } from '../../state/tips.js'
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
  const dex = el('span', { class: 'muted', 'data-dex': '' })
  const stop = intentButton('Parar', () => ctx.sendIntent?.({ t: 'hunt.stop' }))
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
    name, level, xpBar, nextUnlock, el('span', {}, 'ouro:'), gold, dex, el('span', { class: 'muted' }, 'tick'), tick, conn, ...shortcuts, stop, leave))

  // O XP do treinador sobe durante a hunt: o espelho manda, o /me só serve enquanto não há hunt.
  const renderProgress = (): void => {
    const me = ctx.session.get().me
    if (!me) return
    name.textContent = me.trainer.name
    const xp = ctx.hunt.get().state?.trainer.xp ?? me.trainer.xp
    const progress = trainerProgress(ctx.registry, xp)
    level.textContent = `nível ${progress.level}`
    xpBar.setAttribute('value', String(pct(progress.xpInto, progress.xpSpan)))
    nextUnlock.textContent = progress.next ? `próximo: ${progress.next.what} no nível ${progress.next.level}` : 'tudo destravado'
  }
  const offMe = ctx.session.subscribe((s) => s.me, renderProgress)
  const offXp = ctx.hunt.subscribe((v) => v.state?.trainer.xp ?? null, renderProgress)
  const offGold = ctx.hunt.subscribe((v) => v.state?.trainer.gold ?? null, (value) => {
    if (value !== null) gold.textContent = String(value)
  })
  const offTick = ctx.hunt.subscribe((v) => v.tick, (value) => { tick.textContent = String(value) })
  // Contador "Rota 1: n/m": a Pokédex do servidor é lida uma vez e `seen` da sessão atualiza ao vivo.
  let entries: Awaited<ReturnType<typeof loadEntries>> = []
  async function loadEntries() { return (await ctx.http.get('/trainer/pokedex', PokedexSchema)).entries }
  const renderDex = (): void => {
    const huntId = ctx.hunt.get().session?.huntId
    const area = huntId ? findArea(ctx.registry.regions, huntId)?.area : undefined
    if (!area) { dex.textContent = ''; return }
    const { n, m } = huntPokedexCount(ctx.hunt.get(), entries, area.species)
    dex.textContent = `${area.name}: ${n}/${m}`
  }
  void loadEntries().then((loaded) => { entries = loaded; renderDex() }).catch(() => {})
  const offDex = ctx.hunt.subscribe((v) => v.state?.settings.seen, renderDex)
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
  return () => { offMe(); offXp(); offGold(); offTick(); offDex(); offConn(); offPhase() }
}
