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
        const especie = ctx.registry.species.get(member.speciesName)
        const tipos = (especie?.types ?? []).map((t) => el('span', { class: `chip type type-${t}` }, t))
        const hp = el('progress', { class: 'hp-bar', max: String(member.hpMax), value: String(member.hp) })
        hp.setAttribute('data-hp-state', member.hp / member.hpMax > 0.5 ? 'ok' : member.hp / member.hpMax > 0.2 ? 'ferido' : 'critico')
        const slot = el('button', {
          type: 'button',
          class: index === activeIndex ? 'slot slot-active' : 'slot',
          'data-pokemon': member.id,
          title: `${displayName(member.speciesName)} L${member.level}`,
        // O sprite mora num POÇO — uma caixa afundada, com o seu próprio contorno. É o que
        // transforma a linha numa peça de jogo em vez de um item de lista com uma figurinha ao
        // lado do texto: o retrato ganha moldura, e a moldura é do mesmo material das fendas.
        }, el('span', { class: 'slot-poco' }, sprite), el('div', { class: 'slot-dados' },
            el('div', { class: 'slot-linha' },
              el('span', { class: 'slot-nome' }, displayName(member.speciesName)),
              el('span', { class: 'chip chip-nivel' }, `nv ${member.level}`)),
            el('div', { class: 'slot-linha slot-tipos' }, ...tipos),
            // O número vai DENTRO do trilho, encostado na direita. Embaixo dele, era uma terceira
            // linha de texto miúdo por slot — seis vezes na coluna — e ninguém liga 14/14 à barra
            // que está acima sem contar as linhas.
            el('div', { class: 'slot-medidor' }, hp, el('span', { class: 'slot-hp' }, `${member.hp}/${member.hpMax}`))))
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
