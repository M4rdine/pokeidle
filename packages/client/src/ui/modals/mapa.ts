/**
 * O mapa das regiões, como modal.
 *
 * POR QUE MODAL, e não uma tela: durante uma caçada, sair para uma tela significa parar de caçar.
 * O modal abre por cima, o jogo continua rodando atrás, e trocar de área é um clique.
 *
 * O desenho todo — abas, mapa, analisador — mora em `escolher-destino.ts`, compartilhado com a
 * tela de áreas. Aqui fica só o que é do modal: buscar o time, e o que o botão de ação faz.
 */
import { z } from 'zod'
import type { AppContext } from '../../app-context.js'
import { PokedexSchema, StartHuntSchema, TeamSchema } from '../../api/dto.js'
import { hasActiveHunt } from '../../state/hunt-active.js'
import { el } from '../dom.js'
import { escolherDestino, type DadosDoTreinador } from '../screens/areas/escolher-destino.js'
import type { AreaNoMapa } from '../screens/areas/MapaRegiao.js'
import { openModal, type Modal } from './modal.js'

export function openMapa(ctx: AppContext): Modal {
  const regioes = [...ctx.registry.regions.values()].sort((a, b) => a.order - b.order)
  const primeira = regioes[0]
  if (!primeira) {
    return openModal(document.body, 'Mapa', el('p', { class: 'muted' }, 'Nenhuma região carregada.'))
  }

  let regiaoId = primeira.id
  let areaId: string | null = null
  let dados: DadosDoTreinador | null = null
  let erro = ''

  const corpo = el('div', { class: 'mapa-corpo' })

  /**
   * Trocar de área é PARAR e COMEÇAR, nesta ordem, porque o servidor recusa uma segunda caçada
   * enquanto houver uma ativa — e com razão: a sessão precisa ser fechada e o progresso gravado
   * antes de abrir outra.
   *
   * Antes daqui, quem estava caçando clicava "Caçar aqui" e recebia "já existe uma hunt ativa",
   * sem nenhum caminho até o que queria. O jogo punia quem interagia com ele. Os dois passos são
   * de endpoints que já existem; se o segundo falhar, o jogador fica sem caçada e com a mensagem
   * do erro — ruim, mas honesto e recuperável com um clique.
   */
  const cacar = (id: string, botao: HTMLElement): void => {
    erro = ''
    botao.setAttribute('disabled', '')
    const parar = hasActiveHunt(ctx) ? ctx.http.post('/hunts/stop', {}, z.unknown()) : Promise.resolve()
    void parar
      .then(() => ctx.http.post(`/hunts/${id}/start`, {}, StartHuntSchema))
      .then(() => { modal.close(); ctx.go() })
      .catch((e: unknown) => {
        erro = e instanceof Error ? e.message : 'não foi possível começar a caçada'
        botao.removeAttribute('disabled')
        render()
      })
  }

  /**
   * O rótulo conta o que vai acontecer de verdade: trocar de área encerra a caçada atual, e
   * esconder isso atrás de "Caçar aqui" seria mentir sobre uma ação que grava progresso.
   */
  const acao = (area: AreaNoMapa): HTMLElement | null => {
    if (area.locked) return el('p', { class: 'hunt-gate' }, `Abre no nível ${area.minTrainerLevel}`)
    if (ctx.session.get().me?.trainer.activeHuntId === area.id) {
      return el('p', { class: 'muted' }, 'Você já está caçando aqui.')
    }
    return el('button', { type: 'button', class: 'primary', onclick: (ev) => cacar(area.id, ev.currentTarget as HTMLElement) },
      hasActiveHunt(ctx) ? 'Trocar para esta área' : 'Caçar aqui')
  }

  function render(): void {
    corpo.replaceChildren(escolherDestino({
      ctx, regiaoId, areaId, dados, erro, acao,
      aoTrocarRegiao: (id) => { regiaoId = id; areaId = null; erro = ''; render() },
      aoEscolherArea: (id) => { areaId = id; erro = ''; render() },
    }))
  }

  render()
  const modal = openModal(document.body, 'Mapa', corpo)

  // O time e a Pokédex chegam depois: o mapa já é útil sem eles (onde ficam as áreas, que nível
  // pedem) e ganha os números do analisador assim que a resposta volta.
  void Promise.all([
    ctx.http.get('/trainer/team', TeamSchema).then((r) => r.team),
    ctx.http.get('/trainer/pokedex', PokedexSchema).then((r) => r.entries),
  ]).then(([team, entries]) => {
    dados = {
      team: team.map((p) => ({ speciesName: p.speciesName, level: p.level })),
      caught: entries.filter((e) => e.caughtAt !== null).map((e) => e.speciesName),
    }
    render()
  }).catch(() => {
    erro = 'não deu para carregar o seu time; os números do analisador ficam de fora'
    dados = { team: [], caught: [] }
    render()
  })

  return modal
}
