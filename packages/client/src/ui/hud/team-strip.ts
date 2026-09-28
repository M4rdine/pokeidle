import { MAX_TEAM_SLOTS } from '../../config.js'
import type { AppContext } from '../../app-context.js'
import { el } from '../dom.js'
import { nivelDaVaga } from '../../state/progress.js'
import { slotAlvo, vagaLivre, vagaTravada } from '../pokemon-slot.js'

/** Seis lugares: os do time, os vazios liberados e os bloqueados pelo nível do treinador. */
export function mountTeamStrip(root: HTMLElement, ctx: AppContext): () => void {
  // A lista deixa de ser o painel e passa a morar DENTRO dele: `render` troca os filhos da
  // lista a cada tique, e um cabeçalho irmão dela seria varrido junto.
  const strip = el('div', { class: 'team-strip' })
  // A contagem mora no cabeçalho, à direita, como o "poder" da lista de golpes: é a mesma
  // pergunta — quantos dos meus lugares estão ocupados — e ela não merece uma linha própria.
  const contagem = el('span', { class: 'cabeca-conta', 'data-contagem': '' }, '')
  root.append(el('section', { class: 'time-painel panel' },
    el('div', { class: 'cabeca cabeca-barra' }, el('span', {}, 'time'), contagem),
    strip))

  const render = (): void => {
    const view = ctx.hunt.get()
    const team = view.state?.player.team ?? []
    const activeIndex = view.state?.player.activeIndex ?? 0
    const slots = view.state?.settings.teamSlots ?? ctx.session.get().me?.trainer.teamSlots ?? MAX_TEAM_SLOTS
    contagem.textContent = `${team.length}/${slots}`
    const nodes = Array.from({ length: MAX_TEAM_SLOTS }, (_unused, index) => {
      const member = team[index]
      if (member) {
        return slotAlvo({
          ctx, id: member.id, pokemon: member, ativo: index === activeIndex,
          aoClicar: () => ctx.sendIntent?.({ t: 'team.setActive', pokemonId: member.id }),
        })
      }
      if (index < slots) return vagaLivre()
      return vagaTravada(nivelDaVaga(ctx.registry.unlocks, index))
    })
    strip.replaceChildren(...nodes)
  }
  const offTeam = ctx.hunt.subscribe((v) => v.state?.player.team, render)
  const offActive = ctx.hunt.subscribe((v) => v.state?.player.activeIndex, render)
  return () => { offTeam(); offActive() }
}
