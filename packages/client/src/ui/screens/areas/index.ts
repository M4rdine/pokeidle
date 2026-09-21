/**
 * Navegador de áreas: a tela em que o jogador escolhe onde caçar.
 *
 * TESE: a escolha da área é uma comparação, não uma vitrine; esta tela recusa a grade de cartões
 * iguais que todo jogo idle usa aqui, porque cartão lado a lado não deixa comparar coluna.
 * MUNDO: o mesmo do jogo — fundo escuro, painel de borda reta de 2 px sem raio, acento amarelo,
 * cores canônicas de tipo, números tabulares. Nada novo foi inventado para esta tela.
 * HISTÓRIA: o jogador chega sabendo o que quer (subir nível, fechar a Pokédex, farmar um tipo),
 * filtra, lê três números por linha, abre o detalhe da candidata e começa a caçada.
 * PRIMEIRA DOBRA: barra de filtros no topo, contagem "X de Y" ao lado do título, e a ficha de
 * oito linhas com colunas de largura fixa: nome, faixa de nível, espécies, XP/h, ouro/h,
 * confronto, ação. O detalhe abre como gaveta na própria linha, nunca em modal.
 * FORMA: ficha de campo densa (candidata 3 da lista ordenada; semente eec3982f).
 * ACABAMENTO: revisado em desktop e celular, detector limpo, e o registro do sistema em DESIGN.md.
 *
 * Os filtros vivem na URL para a busca ser guardável e compartilhável.
 */
import { estimateArea, type AreaEstimate, type TeamMember, type TypeName } from '@pokeidle/shared'
import type { AppContext, ModalName } from '../../../app-context.js'
import { PokedexSchema, StartHuntSchema, TeamSchema } from '../../../api/dto.js'
import { MODAL_LABELS } from '../../../config.js'
import { applyFilters, filtersFromSearch, isEmpty, searchFromFilters, type AreaFilters } from '../../../state/area-filters.js'
import { trainerProgress } from '../../../state/progress.js'
import { el, mount } from '../../dom.js'
import { areaAnalyzer } from './AreaAnalyzer.js'
import { mapaRegiao } from './MapaRegiao.js'
import { areaRow, type AreaView } from './AreaRow.js'
import { areaFilters, clearFiltersButton } from './AreaFilters.js'

/** Melhor bola do inventário, em bônus de captura. Sem inventário carregado, a Poké Bola. */
const BALL_BONUS = 1

interface Carregado {
  readonly team: readonly TeamMember[]
  readonly caught: readonly string[]
}

/** `null` enquanto a resposta não chegou: distingue "ainda não sei" de "seu time não fere". */
const semDados = null

export function mountAreas(root: HTMLElement, ctx: AppContext): () => void {
  const { me, hunts } = ctx.session.get()
  const error = el('p', { class: 'form-error', role: 'alert' })
  const lista = el('ul', { class: 'area-list' })
  const contagem = el('p', { class: 'area-count' })
  const limparBox = el('div', { class: 'area-head-right' }, contagem)
  const filtrosBox = el('div', { class: 'area-filters-box' })

  let filters: AreaFilters = filtersFromSearch(typeof location === 'undefined' ? '' : location.search)
  let aberta: string | null = null
  let dados: Carregado | null = semDados

  const start = (id: string, button: HTMLElement): void => {
    error.textContent = ''
    button.setAttribute('disabled', '')
    void ctx.http.post(`/hunts/${id}/start`, {}, StartHuntSchema)
      .then(() => ctx.go())
      .catch((err: unknown) => {
        error.textContent = err instanceof Error ? err.message : 'não foi possível começar a caçada'
        button.removeAttribute('disabled')
      })
  }

  const areaDe = (id: string) => {
    for (const region of ctx.registry.regions.values()) {
      const area = region.areas.find((a) => a.id === id)
      if (area) return area
    }
    return undefined
  }

  const estimativaDe = (id: string): AreaEstimate | null => {
    const area = areaDe(id)
    if (!area) return null
    return estimateArea({
      registry: ctx.registry, area,
      team: dados?.team ?? [], caught: dados?.caught ?? [], ballBonus: BALL_BONUS,
    })
  }

  const regiaoDe = (id: string) => {
    for (const region of ctx.registry.regions.values()) {
      if (region.areas.some((a) => a.id === id)) return region
    }
    return undefined
  }

  const views = (): readonly AreaView[] => hunts.flatMap((hunt) => {
    const area = areaDe(hunt.id)
    const estimate = estimativaDe(hunt.id)
    if (!area || !estimate) return []
    return [{
      id: hunt.id, name: hunt.name, minLevel: hunt.minLevel, maxLevel: hunt.maxLevel,
      minTrainerLevel: hunt.minTrainerLevel, locked: hunt.locked, species: area.species,
      rarity: area.rarity, estimate,
    }]
  })

  const tiposDe = (species: string): readonly string[] => ctx.registry.species.get(species)?.types ?? []
  /**
   * Só os tipos que alguma área realmente tem. Dos dezoito, onze não existem em Kanto hoje: eram
   * onze becos sem saída ocupando o maior bloco da tela e levando direto ao estado vazio.
   */
  const tiposDisponiveis = (areas: readonly AreaView[]): ReadonlySet<TypeName> =>
    new Set(areas.flatMap((a) => a.species.flatMap((n) => tiposDe(n) as TypeName[])))
  const tipoDe = (species: string): string => tiposDe(species)[0] ?? 'normal'
  const temNaPokedex = (species: string): boolean => dados?.caught.includes(species) ?? false
  const nomeDoItem = (id: string): string => ctx.registry.items.get(id)?.name ?? id

  const semResultado = (): HTMLElement => el('li', { class: 'area-empty panel' },
    'Nenhuma área combina com esses filtros. ',
    el('button', { type: 'button', class: 'link', onclick: () => aplicar({ ...filters, types: [], matchup: null }) },
      'Solte o tipo e o confronto'),
    ' para ver o que sobra.')

  const render = (): void => {
    const todas = views()
    const filtradas = applyFilters(
      todas.map((v) => ({ ...v, matchup: v.estimate.matchup, missing: v.estimate.missing })),
      filters, ctx.registry)
    const visiveis = new Set(filtradas.map((f) => f.id))
    const escolhidas = todas
      .filter((v) => visiveis.has(v.id))
      .sort((a, b) => Number(a.locked) - Number(b.locked) || a.minTrainerLevel - b.minTrainerLevel)

    contagem.textContent = isEmpty(filters)
      ? `${todas.length} áreas`
      : `${escolhidas.length} de ${todas.length} áreas`

    mount(filtrosBox, areaFilters({ filters, onChange: aplicar, disponiveis: tiposDisponiveis(todas) }))
    limparBox.replaceChildren(contagem, clearFiltersButton({ filters, onChange: aplicar }))
    lista.replaceChildren()
    if (escolhidas.length === 0) { lista.append(semResultado()); return }

    // Agrupado por região, na ordem em que o jogo as abre: com dezesseis áreas numa lista
    // contínua some a noção de "onde estou e o que vem depois", que é metade do que a tela faz.
    const regioes = [...ctx.registry.regions.values()].sort((a, b) => a.order - b.order)
    for (const regiao of regioes) {
      const daRegiao = escolhidas.filter((a) => regiaoDe(a.id)?.id === regiao.id)
      if (daRegiao.length === 0) continue
      const portao = ctx.registry.unlocks.regions[regiao.id] ?? 0
      const fechada = daRegiao.every((a) => a.locked)
      lista.append(el('li', { class: `area-region${fechada ? ' area-region-locked' : ''}` },
        el('h2', {}, regiao.name),
        el('span', { class: 'muted' }, `${daRegiao.length} ${daRegiao.length === 1 ? 'área' : 'áreas'}`),
        fechada && portao > 1 ? el('span', { class: 'area-gate' }, `abre no nível ${portao}`) : null))

      // O mapa vem antes da lista: escolher onde caçar é uma decisão sobre o mundo, e ver o
      // mundo responde de relance o que uma tabela só responde lendo linha por linha.
      const comAncora = daRegiao.flatMap((a) => {
        const noRegistro = regiao.areas.find((r) => r.id === a.id)
        return noRegistro ? [{ ...a, anchor: noRegistro.anchor }] : []
      })
      if (comAncora.length > 0) {
        lista.append(el('li', { class: 'area-mapa' }, mapaRegiao({
          regiaoId: regiao.id,
          regiaoNome: regiao.name,
          grade: { width: regiao.width, height: regiao.height },
          atlas: ctx.atlas,
          areas: comAncora,
          selecionada: aberta,
          aoEscolher: (id) => { aberta = aberta === id ? null : id; render() },
        })))
      }
      for (const area of daRegiao) {
        lista.append(areaRow({
          area, atlas: ctx.atlas, tipoDe, selecionada: aberta === area.id, estimado: dados !== null,
          onSelect: (id) => { aberta = aberta === id ? null : id; render() },
          onStart: start,
        }))
        if (aberta === area.id) {
          lista.append(el('li', { class: 'area-detail' },
            areaAnalyzer({ estimate: area.estimate, atlas: ctx.atlas, tiposDe, temNaPokedex, ballBonus: BALL_BONUS, nomeDoItem })))
        }
      }
    }
  }

  function aplicar(novos: AreaFilters): void {
    filters = novos
    aberta = null
    if (typeof history !== 'undefined' && typeof location !== 'undefined') {
      history.replaceState(null, '', `${location.pathname}${searchFromFilters(filters)}`)
    }
    render()
  }

  const progress = me ? trainerProgress(ctx.registry, me.trainer.xp) : null
  // Cada número vem com o rótulo do que ele é. "81227" solto ao lado de "nível 65" obrigava a
  // adivinhar qual dos dois era o ouro — e adivinhar é o que um painel de instrumento evita.
  const leitura = (rotulo: string, valor: string, classe = ''): HTMLElement =>
    el('span', { class: `leitura ${classe}`.trim() }, el('span', {}, rotulo), el('span', {}, valor))

  const bar = el('header', { class: 'trainer-bar panel' },
    el('strong', {}, me?.trainer.name ?? ''),
    leitura('nível', String(progress?.level ?? 1)),
    leitura('ouro', (me?.trainer.gold ?? 0).toLocaleString('pt-BR'), 'leitura-ouro'),
    el('span', { class: 'muted' }, progress?.next ? `próximo: ${progress.next.what} no nível ${progress.next.level}` : 'tudo destravado'))

  const shortcuts = el('nav', { class: 'shortcuts' },
    ...(Object.keys(MODAL_LABELS) as ModalName[]).map((name) =>
      el('button', { type: 'button', 'data-open': name, onclick: () => ctx.openModal?.(name) }, MODAL_LABELS[name])))

  mount(root, el('main', { class: 'screen screen-areas' },
    bar,
    el('div', { class: 'area-head' }, el('h1', {}, 'Onde caçar'), limparBox),
    filtrosBox,
    lista,
    shortcuts,
    error))
  render()

  // O time e a Pokédex chegam depois: a ficha já é útil sem eles (níveis, espécies, portão) e
  // ganha os números do analisador assim que a resposta volta.
  void Promise.all([
    ctx.http.get('/trainer/team', TeamSchema).then((r) => r.team),
    ctx.http.get('/trainer/pokedex', PokedexSchema).then((r) => r.entries),
  ]).then(([team, entries]) => {
    dados = {
      team: team.map((p) => ({ speciesName: p.speciesName, level: p.level })),
      caught: entries.filter((e) => e.caughtAt !== null).map((e) => e.speciesName),
    }
    render()
  }).catch(() => { error.textContent = 'não deu para carregar o seu time; os números do analisador ficam de fora' })

  return () => { root.replaceChildren() }
}
