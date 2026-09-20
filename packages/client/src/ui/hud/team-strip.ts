import { MAX_TEAM_SLOTS } from '../../config.js'
import type { AppContext } from '../../app-context.js'
import { displayName } from '../../state/log.js'
import { el } from '../dom.js'
import { nivelDaVaga } from '../../state/progress.js'
import { spriteThumb } from '../sprite-css.js'

/** Lado do sprite dentro do slot, em pixels. */
const LADO_SLOT = 32

/** Seis lugares: os do time, os vazios liberados e os bloqueados pelo nível do treinador. */
export function mountTeamStrip(root: HTMLElement, ctx: AppContext): () => void {
  const strip = el('section', { class: 'team-strip panel' })
  root.append(strip)

  const render = (): void => {
    const view = ctx.hunt.get()
    const team = view.state?.player.team ?? []
    const activeIndex = view.state?.player.activeIndex ?? 0
    const slots = view.state?.settings.teamSlots ?? ctx.session.get().me?.trainer.teamSlots ?? MAX_TEAM_SLOTS
    const nodes = Array.from({ length: MAX_TEAM_SLOTS }, (_unused, index) => {
      const member = team[index]
      if (member) {
        // Mesma caixa das outras telas: o frame do atlas tem 32 ou 64 px conforme a espécie, e
        // sem caixa um Rhydon sai do slot.
        const sprite = spriteThumb(ctx.atlas, member.speciesName, LADO_SLOT)
        const slot = el('button', {
          type: 'button',
          class: index === activeIndex ? 'slot slot-active' : 'slot',
          'data-pokemon': member.id,
          title: `${displayName(member.speciesName)} L${member.level}`,
        }, sprite, el('span', { class: 'slot-hp' }, `${member.hp}/${member.hpMax}`))
        slot.addEventListener('click', () => ctx.sendIntent?.({ t: 'team.setActive', pokemonId: member.id }))
        return slot
      }
      if (index < slots) return el('div', { class: 'slot slot-empty' }, 'vazio')
      // O nível que destrava é informação; o cadeado em emoji que estava aqui não era.
      const nivel = nivelDaVaga(ctx.registry.unlocks, index)
      return el('div', {
        class: 'slot slot-locked',
        title: nivel === null ? 'vaga indisponível' : `destrava no nível ${nivel} do treinador`,
      }, nivel === null ? 'indisponível' : `nv ${nivel}`)
    })
    strip.replaceChildren(...nodes)
  }
  const offTeam = ctx.hunt.subscribe((v) => v.state?.player.team, render)
  const offActive = ctx.hunt.subscribe((v) => v.state?.player.activeIndex, render)
  return () => { offTeam(); offActive() }
}
