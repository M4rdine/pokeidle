/**
 * Organizar o time: a ordem de quem sai primeiro, e o vaivém entre time e mochila.
 *
 * O QUE CAIU. Este painel mostrava os mesmos Pokémon do HUD como LINHAS DE TEXTO: "bulbasaur L12"
 * ao lado de "31/31" em cinza, e três botões avulsos. Enquanto isso, a dois cliques dali, a coluna
 * do HUD mostrava cada um como peça — retrato num poço da cor do tipo, selos, medidor de HP com
 * estado. O pior dos dois desenhos estava na tela onde o jogador de fato ORGANIZA o time.
 *
 * Agora as duas usam a mesma peça (`pokemon-slot.ts`). O que este painel acrescenta é o que só
 * ele faz: o trilho de ações de cada peça, as vagas livres e travadas mostrando a capacidade, e a
 * mochila embaixo.
 */
import type { AppContext } from '../../app-context.js'
import { MAX_TEAM_SLOTS } from '../../config.js'
import { TeamSchema, type PokemonDto } from '../../api/dto.js'
import { hasActiveHunt } from '../../state/hunt-active.js'
import { nivelDaVaga } from '../../state/progress.js'
import { el } from '../dom.js'
import { slotCartao, vagaLivre, vagaTravada } from '../pokemon-slot.js'
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
  const slots = ctx.session.get().me?.trainer.teamSlots ?? MAX_TEAM_SLOTS

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

  /** Um cabeçalho de seção, na mesma faixa dos painéis do jogo, com a contagem à direita. */
  const secao = (titulo: string, conta: string): HTMLElement =>
    el('div', { class: 'cabeca cabeca-barra' }, el('span', {}, titulo), el('span', { class: 'cabeca-conta' }, conta))

  function render(team: readonly PokemonDto[], box: readonly PokemonDto[]): void {
    const ids = team.map((p) => p.id)
    const disabled = inHunt
    const ficha = (pokemon: PokemonDto) => () => mostrarFicha(pokemon.speciesName, () => render(team, box))

    /*
     * As seis vagas, e não só os ocupados: a capacidade é metade da resposta que esta tela dá.
     * Sem as vagas, um time de dois parecia um time completo de dois, e o jogador não via que
     * tinha lugar sobrando nem qual nível abre o próximo.
     */
    const vagasDoTime = Array.from({ length: MAX_TEAM_SLOTS }, (_unused, index) => {
      const pokemon = team[index]
      if (!pokemon) return index < slots ? vagaLivre() : vagaTravada(nivelDaVaga(ctx.registry.unlocks, index))
      const subir = el('button', { type: 'button', class: 'slot-acao', 'data-acao': 'subir', 'aria-label': `subir ${pokemon.speciesName}`, ...((disabled || index === 0) && { disabled: true }) }, '↑')
      const descer = el('button', { type: 'button', class: 'slot-acao', 'data-acao': 'descer', 'aria-label': `descer ${pokemon.speciesName}`, ...((disabled || index === team.length - 1) && { disabled: true }) }, '↓')
      const guardar = el('button', { type: 'button', class: 'slot-acao discreto', 'data-acao': 'guardar', ...(disabled && { disabled: true }) }, 'Guardar')
      subir.addEventListener('click', () => save(swap(ids, index, index - 1)))
      descer.addEventListener('click', () => save(swap(ids, index, index + 1)))
      guardar.addEventListener('click', () => save(ids.filter((id) => id !== pokemon.id)))
      return slotCartao({ ctx, id: pokemon.id, pokemon, aoAbrirFicha: ficha(pokemon), acoes: [subir, descer, guardar] })
    })

    const naMochila = box.map((pokemon) => {
      const colocar = el('button', { type: 'button', class: 'slot-acao discreto', 'data-acao': 'colocar', ...((disabled || team.length >= slots) && { disabled: true }) }, 'Colocar no time')
      colocar.addEventListener('click', () => save([...ids, pokemon.id]))
      return slotCartao({ ctx, id: pokemon.id, pokemon, aoAbrirFicha: ficha(pokemon), acoes: [colocar] })
    })

    body.replaceChildren(
      // O aviso vem ANTES de tudo: é ele que explica por que os botões abaixo estão apagados, e
      // depois dos botões chegaria tarde.
      ...(disabled ? [el('p', { class: 'aviso-bloqueio', role: 'status' }, 'Pare a caçada para mexer no time.')] : []),
      secao('time', `${team.length}/${slots}`),
      el('div', { class: 'team-lista' }, ...vagasDoTime),
      secao('mochila de pokémon', String(box.length)),
      naMochila.length > 0
        ? el('div', { class: 'team-lista' }, ...naMochila)
        : el('p', { class: 'team-vazia muted' }, 'Nada guardado. O que você capturar e não couber no time aparece aqui.'),
      error)
  }

  void ctx.http.get('/trainer/team', TeamSchema)
    .then((data) => render(data.team, data.box))
    .catch(() => body.replaceChildren(el('p', { class: 'form-error' }, 'não foi possível carregar o time')))
  return openModal(document.body, 'Time', body)
}
