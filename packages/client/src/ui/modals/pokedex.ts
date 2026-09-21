import type { AppContext } from '../../app-context.js'
import { PokedexSchema, type PokedexEntry } from '../../api/dto.js'
import { displayName } from '../../state/log.js'
import { el } from '../dom.js'
import { spriteThumb } from '../sprite-css.js'
import { speciesSheet } from '../species/sheet.js'
import { openModal, type Modal } from './modal.js'

/** Lado do sprite na grade da Pokédex, em pixels. */
const LADO_DEX = 32

/**
 * Botão de volta da ficha. A ficha mora dentro do modal que a abriu porque o projeto mantém um
 * modal por vez: abrir um segundo fecharia este e o jogador perderia o lugar na lista.
 */
export function botaoVoltar(rotulo: string, aoVoltar: () => void): HTMLElement {
  const botao = el('button', { type: 'button', 'data-voltar': '' }, `← ${rotulo}`)
  botao.addEventListener('click', aoVoltar)
  return botao
}

/** Todas as espécies do registro: capturadas, vistas e desconhecidas (estas sem sprite nem nome). */
export function openPokedex(ctx: AppContext): Modal {
  const body = el('div', { class: 'pokedex' }, el('p', { class: 'muted' }, 'Carregando…'))

  const mostrarFicha = (name: string, voltar: () => void): void => {
    body.replaceChildren(botaoVoltar('Pokédex', voltar), speciesSheet(ctx, name))
  }

  const render = (entries: readonly PokedexEntry[]): void => {
    const byName = new Map(entries.map((entry) => [entry.speciesName, entry]))
    const seenInSession = new Set(ctx.hunt.get().state?.settings.seen ?? [])
    const species = [...ctx.registry.species.values()].sort((a, b) => a.id - b.id)
    const caught = species.filter((s) => byName.get(s.name)?.caughtAt != null || seenInSession.has(s.name)).length
    const seen = species.filter((s) => byName.has(s.name) || seenInSession.has(s.name)).length
    body.replaceChildren(
      el('p', { class: 'muted' }, `Capturados: ${caught} · Vistos: ${seen} · Total: ${species.length}`),
      el('div', { class: 'pokedex-grid' }, ...species.map((one) => {
        const entry = byName.get(one.name)
        const isCaught = entry?.caughtAt != null || seenInSession.has(one.name)
        const isSeen = entry !== undefined || isCaught
        const cell = el('div', { class: `dex-cell ${isCaught ? 'caught' : isSeen ? 'seen' : 'unknown'}`, 'data-species': one.name })
        if (isSeen) {
          cell.append(spriteThumb(ctx.atlas, one.name, LADO_DEX), el('span', {}, displayName(one.name)))
          // Só o que já foi visto abre ficha: mostrar atributos de quem o jogador nunca encontrou
          // entregaria o conteúdo que a Pokédex existe para revelar aos poucos.
          cell.setAttribute('role', 'button')
          cell.setAttribute('tabindex', '0')
          const abrir = (): void => mostrarFicha(one.name, () => render(entries))
          cell.addEventListener('click', abrir)
          cell.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); abrir() } })
        } else cell.append(el('span', { class: 'muted' }, '???'))
        return cell
      })))
  }

  void ctx.http.get('/trainer/pokedex', PokedexSchema)
    .then((data) => render(data.entries))
    .catch(() => body.replaceChildren(el('p', { class: 'form-error' }, 'não foi possível carregar a Pokédex')))
  return openModal(document.body, 'Pokédex', body)
}
