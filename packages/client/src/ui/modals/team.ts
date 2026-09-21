import type { AppContext } from '../../app-context.js'
import { TeamSchema, type PokemonDto } from '../../api/dto.js'
import { displayName } from '../../state/log.js'
import { hasActiveHunt } from '../../state/hunt-active.js'
import { el } from '../dom.js'
import { botaoVoltar } from './pokedex.js'
import { speciesSheet } from '../species/sheet.js'
import { openModal, type Modal } from './modal.js'

const swap = (ids: readonly string[], a: number, b: number): string[] => {
  const next = [...ids]
  const first = next[a]
  const second = next[b]
  if (first === undefined || second === undefined) return next
  next[a] = second
  next[b] = first
  return next
}

/** Ordem do time e mochila de Pokémon; tudo bloqueado enquanto houver hunt ativa (o servidor recusa). */
export function openTeam(ctx: AppContext): Modal {
  const body = el('div', { class: 'team-modal' }, el('p', { class: 'muted' }, 'Carregando…'))
  const error = el('p', { class: 'form-error', role: 'alert' })
  const inHunt = hasActiveHunt(ctx)
  const slots = ctx.session.get().me?.trainer.teamSlots ?? 6

  const save = (ids: readonly string[]): void => {
    error.textContent = ''
    void ctx.http.put('/trainer/team', { slots: ids }, TeamSchema)
      .then((next) => { render(next.team, next.box) })
      .catch((err: unknown) => { error.textContent = err instanceof Error ? err.message : 'não foi possível salvar' })
  }
  /** Mostra a ficha da espécie no lugar da lista; `voltar` refaz a lista de onde ela parou. */
  const mostrarFicha = (speciesName: string, voltar: () => void): void => {
    body.replaceChildren(botaoVoltar('Time', voltar), speciesSheet(ctx, speciesName))
  }

  const line = (pokemon: PokemonDto, extra: HTMLElement[], abrirFicha: () => void): HTMLElement => {
    // O nome vira botão: ele é a porta para a ficha da espécie, e era o lugar onde o jogador já
    // tentava clicar sem que nada acontecesse.
    const nome = el('button', { type: 'button', class: 'team-nome', 'data-ficha': pokemon.id },
      `${displayName(pokemon.speciesName)} L${pokemon.level}`)
    nome.addEventListener('click', abrirFicha)
    return el('div', { class: 'team-row', 'data-pokemon': pokemon.id },
      nome,
      el('span', { class: 'muted' }, `${pokemon.hp}/${pokemon.hpMax}`),
      ...extra)
  }

  function render(team: readonly PokemonDto[], box: readonly PokemonDto[]): void {
    const ids = team.map((p) => p.id)
    const disabled = inHunt
    const rows = team.map((pokemon, index) => {
      const up = el('button', { type: 'button', 'data-acao': 'subir', 'aria-label': 'subir', ...((disabled || index === 0) && { disabled: true }) }, '↑')
      const down = el('button', { type: 'button', 'data-acao': 'descer', 'aria-label': 'descer', ...((disabled || index === team.length - 1) && { disabled: true }) }, '↓')
      const store = el('button', { type: 'button', 'data-acao': 'guardar', ...(disabled && { disabled: true }) }, 'Guardar')
      up.addEventListener('click', () => save(swap(ids, index, index - 1)))
      down.addEventListener('click', () => save(swap(ids, index, index + 1)))
      store.addEventListener('click', () => save(ids.filter((id) => id !== pokemon.id)))
      return line(pokemon, [up, down, store], () => mostrarFicha(pokemon.speciesName, () => render(team, box)))
    })
    const boxRows = box.map((pokemon) => {
      const add = el('button', { type: 'button', 'data-acao': 'colocar', ...((disabled || team.length >= slots) && { disabled: true }) }, 'Colocar no time')
      add.addEventListener('click', () => save([...ids, pokemon.id]))
      return line(pokemon, [add], () => mostrarFicha(pokemon.speciesName, () => render(team, box)))
    })
    body.replaceChildren(
      el('p', { class: 'muted' }, `vagas: ${team.length}/${slots}`),
      ...(disabled ? [el('p', { class: 'form-error' }, 'pare a hunt para mexer no time')] : []),
      el('h3', {}, 'Time'), ...rows,
      el('h3', {}, 'Mochila de Pokémon'), ...(boxRows.length > 0 ? boxRows : [el('p', { class: 'muted' }, 'vazia')]),
      error)
  }

  void ctx.http.get('/trainer/team', TeamSchema)
    .then((data) => render(data.team, data.box))
    .catch(() => body.replaceChildren(el('p', { class: 'form-error' }, 'não foi possível carregar o time')))
  return openModal(document.body, 'Time', body)
}
