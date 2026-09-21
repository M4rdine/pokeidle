/**
 * A tela de escolher onde caçar. É onde o jogador cai quando não há caçada em andamento.
 *
 * TESE: **o mapa é a interface.** O jogador olha o mundo, aponta um marcador e lê o veredito ao
 * lado. É a mesma decisão do modal do Mapa, e agora é literalmente o mesmo componente.
 *
 * O QUE CAIU, e por quê. Esta tela era uma ficha de campo densa: barra de filtros por tipo e
 * confronto, contagem "X de Y", o mapa, e abaixo dele DEZESSEIS LINHAS de tabela com o detalhe
 * abrindo como SANFONA dentro da própria lista. Três formas de ver a mesma área na mesma tela.
 * Duas coisas estavam erradas:
 *
 *  1. O mapa decidia e a lista o empurrava para fora da primeira dobra. Quem chega aqui está
 *     perguntando "para onde vou agora", e o mapa responde de relance o que a tabela só responde
 *     lendo linha por linha.
 *  2. Filtrar dezesseis áreas é resolver um problema que não existe. A barra de filtros custava
 *     o maior bloco da tela, e o mapa mostra as dezesseis de uma vez.
 *
 * A sanfona era a pior parte: abrir uma área empurrava as de baixo, então comparar duas exigia
 * fechar uma. O analisador agora é um painel fixo ao lado, que não empurra nada.
 */
import type { AppContext, ModalName } from '../../../app-context.js'
import { PokedexSchema, StartHuntSchema, TeamSchema } from '../../../api/dto.js'
import { MODAL_ICONS, MODAL_LABELS } from '../../../config.js'
import { trainerProgress } from '../../../state/progress.js'
import { el, mount } from '../../dom.js'
import { escolherDestino, type DadosDoTreinador } from './escolher-destino.js'
import type { AreaNoMapa } from './MapaRegiao.js'

export function mountAreas(root: HTMLElement, ctx: AppContext): () => void {
  const { me } = ctx.session.get()
  const regioes = [...ctx.registry.regions.values()].sort((a, b) => a.order - b.order)
  const primeira = regioes[0]

  let regiaoId = primeira?.id ?? ''
  let areaId: string | null = null
  let dados: DadosDoTreinador | null = null
  let erro = ''

  const start = (id: string, botao: HTMLElement): void => {
    erro = ''
    botao.setAttribute('disabled', '')
    void ctx.http.post(`/hunts/${id}/start`, {}, StartHuntSchema)
      .then(() => ctx.go())
      .catch((err: unknown) => {
        erro = err instanceof Error ? err.message : 'não foi possível começar a caçada'
        botao.removeAttribute('disabled')
        render()
      })
  }

  const acao = (area: AreaNoMapa): HTMLElement | null => area.locked
    ? el('p', { class: 'hunt-gate' }, `Abre no nível ${area.minTrainerLevel}`)
    : el('button', { type: 'button', class: 'primary', onclick: (ev) => start(area.id, ev.currentTarget as HTMLElement) }, 'Caçar aqui')

  const progresso = me ? trainerProgress(ctx.registry, me.trainer.xp) : null

  /**
   * As mesmas funções do menu do jogo. Sem caçada ativa não existe HUD, então SEM ISTO esta tela
   * é um beco: o jogador que parou para comprar poção não tem por onde abrir a Loja. Foi o que
   * aconteceu quando a tela foi reescrita — e quem pegou foi o smoke do Playwright, procurando o
   * botão "Loja" depois de parar a caçada.
   */
  const funcoes = el('nav', { class: 'menu panel', 'aria-label': 'Funções do jogo' },
    el('div', { class: 'menu-grade' },
      ...(Object.keys(MODAL_LABELS) as ModalName[]).map((modal) =>
        el('button', { type: 'button', class: 'menu-item', 'data-open': modal, onclick: () => ctx.openModal?.(modal) },
          el('span', { class: 'icone', 'data-icone': MODAL_ICONS[modal] }),
          el('span', {}, MODAL_LABELS[modal])))))

  function render(): void {
    if (primeira === undefined) {
      mount(root, el('main', { class: 'screen screen-areas' }, el('p', { class: 'muted' }, 'Nenhuma região carregada.')))
      return
    }
    mount(root, el('main', { class: 'screen screen-areas' },
      el('header', { class: 'area-head' },
        el('h1', {}, 'Onde caçar'),
        progresso
          ? el('p', { class: 'muted' },
              `Nível ${progresso.level} · `,
              el('span', { class: 'area-ouro' }, (me?.trainer.gold ?? 0).toLocaleString('pt-BR')),
              ` de ouro · ${progresso.next?.what ?? 'tudo destravado'}`)
          : null),
      funcoes,
      escolherDestino({
        ctx, regiaoId, areaId, dados, erro, acao,
        aoTrocarRegiao: (id) => { regiaoId = id; areaId = null; erro = ''; render() },
        aoEscolherArea: (id) => { areaId = id; erro = ''; render() },
      })))
  }

  render()

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

  return () => { root.replaceChildren() }
}
