/**
 * O mapa das regiões, como modal.
 *
 * TESE: escolher onde caçar é uma decisão sobre o MUNDO, e o mundo se vê de relance. A tela de
 * áreas continua existindo para quem quer comparar coluna por coluna; aqui o jogador olha o mapa,
 * passa por um marcador e lê o veredito.
 *
 * POR QUE MODAL, e não uma tela: durante uma caçada, sair para uma tela significa parar de caçar.
 * O modal abre por cima, o jogo continua rodando atrás, e trocar de área é um clique — que é
 * justamente o que o gênero faz e o que a nossa tela de áreas não permitia sem interromper.
 */
import { estimateArea, type AreaEstimate, type TeamMember } from '@pokeidle/shared'
import { z } from 'zod'
import type { AppContext } from '../../app-context.js'
import { PokedexSchema, StartHuntSchema, TeamSchema } from '../../api/dto.js'
import { hasActiveHunt } from '../../state/hunt-active.js'
import { el } from '../dom.js'
import { areaAnalyzer } from '../screens/areas/AreaAnalyzer.js'
import { mapaRegiao, type AreaNoMapa } from '../screens/areas/MapaRegiao.js'
import { openModal, type Modal } from './modal.js'

/** Melhor bola do inventário, em bônus de captura. Sem inventário carregado, a Poké Bola. */
const BALL_BONUS = 1

interface Carregado {
  readonly team: readonly TeamMember[]
  readonly caught: readonly string[]
}

export function openMapa(ctx: AppContext): Modal {
  const regioes = [...ctx.registry.regions.values()].sort((a, b) => a.order - b.order)
  const primeira = regioes[0]
  if (!primeira) {
    return openModal(document.body, 'Mapa', el('p', { class: 'muted' }, 'Nenhuma região carregada.'))
  }

  let regiaoId = primeira.id
  let areaId: string | null = null
  /** `null` enquanto o time não chegou: distingue "ainda não sei" de "seu time não fere". */
  let dados: Carregado | null = null
  let erro = ''

  const abas = el('div', { class: 'mapa-abas', role: 'tablist' })
  const palco = el('div', { class: 'mapa-palco' })
  const corpo = el('div', { class: 'mapa-modal' }, abas, palco)

  const huntDe = (id: string) => ctx.session.get().hunts.find((h) => h.id === id)

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

  /** As áreas da região atual que o servidor conhece, já com a estimativa do time. */
  const areasDaRegiao = (): readonly AreaNoMapa[] => {
    const regiao = ctx.registry.regions.get(regiaoId)
    if (!regiao) return []
    return regiao.areas.flatMap((area): AreaNoMapa[] => {
      const hunt = huntDe(area.id)
      if (!hunt) return []
      const estimate = estimateArea({
        registry: ctx.registry, area,
        team: dados?.team ?? [], caught: dados?.caught ?? [], ballBonus: BALL_BONUS,
      })
      return [{
        id: area.id, name: hunt.name, minLevel: hunt.minLevel, maxLevel: hunt.maxLevel,
        minTrainerLevel: hunt.minTrainerLevel, locked: hunt.locked, species: area.species,
        rarity: area.rarity, estimate, anchor: area.anchor,
      }]
    })
  }

  const tiposDe = (species: string): readonly string[] => ctx.registry.species.get(species)?.types ?? []
  const temNaPokedex = (species: string): boolean => dados?.caught.includes(species) ?? false
  const nomeDoItem = (id: string): string => ctx.registry.items.get(id)?.name ?? id

  /**
   * O painel do lado: o mesmo analisador da tela de áreas. Reusar em vez de desenhar outro é o
   * que impede os dois lugares de darem números diferentes para a mesma área.
   */
  const analisador = (area: AreaNoMapa | undefined): HTMLElement => {
    if (!area) {
      return el('aside', { class: 'mapa-analise panel' },
        el('p', { class: 'cabeca cabeca-barra' }, 'Analisador'),
        el('p', { class: 'muted' }, 'Escolha uma área no mapa para ver o que ela rende.'))
    }
    // O rótulo conta o que vai acontecer de verdade: trocar de área encerra a caçada atual, e
    // esconder isso atrás de "Caçar aqui" seria mentir sobre uma ação que grava progresso.
    const emCaca = hasActiveHunt(ctx)
    const atual = ctx.session.get().me?.trainer.activeHuntId === area.id
    const acao = area.locked
      ? el('p', { class: 'hunt-gate' }, `Abre no nível ${area.minTrainerLevel}`)
      : atual
        ? el('p', { class: 'muted' }, 'Você já está caçando aqui.')
        : el('button', { type: 'button', class: 'primary', onclick: (ev) => cacar(area.id, ev.currentTarget as HTMLElement) },
            emCaca ? 'Trocar para esta área' : 'Caçar aqui')
    return el('aside', { class: 'mapa-analise panel' },
      el('div', { class: 'mapa-analise-topo' },
        el('h3', {}, area.name),
        el('span', { class: 'chip chip-nivel' }, `nv ${area.minLevel}–${area.maxLevel}`)),
      dados === null
        ? el('p', { class: 'muted', 'aria-busy': 'true' }, 'Medindo com o seu time…')
        : areaAnalyzer({ estimate: area.estimate, atlas: ctx.atlas, tiposDe, temNaPokedex, ballBonus: BALL_BONUS, nomeDoItem }),
      acao,
      erro ? el('p', { class: 'form-error', role: 'alert' }, erro) : null)
  }

  function render(): void {
    const areas = areasDaRegiao()
    const escolhida = areas.find((a) => a.id === areaId)

    abas.replaceChildren(...regioes.map((r) => {
      const portao = ctx.registry.unlocks.regions[r.id] ?? 0
      const ativa = r.id === regiaoId
      const aba = el('button', {
        type: 'button', role: 'tab', class: `mapa-aba${ativa ? ' tab-active' : ''}`,
        'aria-selected': ativa ? 'true' : 'false',
      }, el('span', {}, r.name), el('span', { class: 'mapa-aba-nivel' }, `nv ${Math.max(1, portao)}`))
      // Trocar de região limpa a área escolhida: um analisador de Kanto ao lado do mapa das
      // Terras Altas seria um número certo apontando para o lugar errado.
      aba.addEventListener('click', () => { regiaoId = r.id; areaId = null; erro = ''; render() })
      return aba
    }))

    const regiao = ctx.registry.regions.get(regiaoId)
    palco.replaceChildren(
      regiao && areas.length > 0
        ? mapaRegiao({
            regiaoId: regiao.id, regiaoNome: regiao.name,
            grade: { width: regiao.width, height: regiao.height },
            atlas: ctx.atlas,
            areas, selecionada: areaId,
            aoEscolher: (id) => { areaId = areaId === id ? null : id; erro = ''; render() },
          })
        : el('p', { class: 'muted' }, 'Esta região ainda não tem áreas liberadas.'),
      analisador(escolhida))
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

export type { AreaEstimate }
