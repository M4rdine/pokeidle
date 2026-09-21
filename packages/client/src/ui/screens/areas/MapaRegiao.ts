/**
 * O mapa-múndi da região, com um marcador por área.
 *
 * É a tela de caça do gênero: o jogador vê o mundo, não uma tabela. A imagem é gerada pelo
 * pipeline (`pnpm assets region-preview`) a partir das mesmas áreas que o servidor simula, então
 * o que se vê aqui é o mapa de verdade, e não uma ilustração que pode divergir do jogo.
 */
import type { AtlasData } from '../../../scene/atlas.js'
import { el } from '../../dom.js'
import { spriteThumb } from '../../sprite-css.js'
import { posicaoNoMapa, type GradeDaRegiao, type Ponto } from './mapa.js'
import type { AreaView } from './AreaRow.js'

export interface AreaNoMapa extends AreaView {
  readonly anchor: Ponto
}

interface Props {
  readonly regiaoId: string
  readonly regiaoNome: string
  readonly grade: GradeDaRegiao
  readonly atlas: AtlasData
  readonly areas: readonly AreaNoMapa[]
  readonly selecionada: string | null
  readonly aoEscolher: (areaId: string) => void
}

/** Lado do sprite dentro do medalhão, em pixels. */
const LADO_MEDALHAO = 32

/**
 * Degraus de zoom. Inteiros de propósito: o mapa é arte de pixel, e ampliar por 1,5 borraria a
 * grade mesmo com `image-rendering: pixelated` — meio pixel não existe.
 */
const ZOOM = [1, 2, 3] as const
/** Quanto o ponteiro pode andar antes de um clique virar arraste, em pixels. */
const FOLGA_ARRASTE = 4

/** Rótulo curto do marcador: o nível é o que decide se dá para ir agora. */
const rotuloDoMarcador = (area: AreaNoMapa): string =>
  area.locked ? `nv ${area.minTrainerLevel}` : `${area.minLevel}–${area.maxLevel}`

/**
 * O texto que o marcador diz a quem não o vê. O nome sozinho não decide nada: quem olha o mapa
 * está perguntando "dá para ir agora e vale a pena", e as duas respostas são o nível e o portão.
 */
const descricao = (area: AreaNoMapa): string => area.locked
  ? `${area.name} — abre no nível ${area.minTrainerLevel}`
  : `${area.name} — níveis ${area.minLevel} a ${area.maxLevel}`

export function mapaRegiao(props: Props): HTMLElement {
  const { regiaoId, regiaoNome, grade, areas, selecionada, aoEscolher } = props

  const imagem = el('img', {
    class: 'mapa-imagem',
    src: `/assets/maps/${regiaoId}.png`,
    alt: `Mapa de ${regiaoNome}`,
    loading: 'eager',
    decoding: 'async',
  })

  const marcadores = areas.map((area) => {
    const { esquerda, topo } = posicaoNoMapa(grade, area.anchor)
    const classes = ['mapa-marcador']
    if (area.locked) classes.push('mapa-marcador-travado')
    if (area.id === selecionada) classes.push('mapa-marcador-ativo')
    const botao = el('button', {
      type: 'button',
      class: classes.join(' '),
      'data-area': area.id,
      'aria-pressed': area.id === selecionada ? 'true' : 'false',
      title: descricao(area),
      'aria-label': descricao(area),
    },
      // O sprite da primeira espécie, e não o nome da área: quem olha o mapa quer saber O QUE
      // mora ali. "Bosque Denso" não diz; um Butterfree diz na hora, e no idioma do jogo.
      el('span', { class: 'mapa-medalha' },
        area.species[0] ? spriteThumb(props.atlas, area.species[0], LADO_MEDALHAO) : el('span', { class: 'sprite-unknown' })),
      el('span', { class: 'mapa-nivel' }, rotuloDoMarcador(area)),
      el('span', { class: 'so-leitor' }, descricao(area)))
    // Porcentagem: a imagem escala com a tela e o marcador acompanha sem recalcular nada.
    botao.style.setProperty('left', `${esquerda}%`)
    botao.style.setProperty('top', `${topo}%`)
    botao.addEventListener('click', () => aoEscolher(area.id))
    return botao
  })

  /*
   * O zoom muda a LARGURA do mundo, não a escala dele. Com `transform: scale` os marcadores
   * cresceriam junto e a três vezes um medalhão tomaria meia tela; mudando a largura, a imagem
   * cresce, os marcadores continuam ancorados em porcentagem — então acompanham o lugar certo —
   * e o tamanho deles em pixels não muda. É o que a referência faz.
   */
  const mundo = el('div', { class: 'mapa-mundo' }, imagem, el('div', { class: 'mapa-marcadores' }, ...marcadores))
  const janela = el('div', { class: 'mapa-janela' }, mundo)
  let nivel = 0
  const aplicarZoom = (): void => {
    mundo.style.setProperty('--zoom', String(ZOOM[nivel]))
    menos.disabled = nivel === 0
    mais.disabled = nivel === ZOOM.length - 1
  }
  /** Aproxima mantendo no lugar o ponto do mapa que está no centro da janela. */
  const trocarZoom = (passo: number): void => {
    const antes = ZOOM[nivel]!
    const proximo = Math.min(ZOOM.length - 1, Math.max(0, nivel + passo))
    if (proximo === nivel) return
    const cx = (janela.scrollLeft + janela.clientWidth / 2) / antes
    const cy = (janela.scrollTop + janela.clientHeight / 2) / antes
    nivel = proximo
    aplicarZoom()
    const depois = ZOOM[nivel]!
    janela.scrollLeft = cx * depois - janela.clientWidth / 2
    janela.scrollTop = cy * depois - janela.clientHeight / 2
  }
  // O ícone é FILHO, não fundo do botão: a moldura usa `border-image` com `fill`, e o `fill`
  // pinta o miolo da peça por cima de qualquer `background` — o ícone sumia atrás da madeira.
  const menos = el('button', { type: 'button', class: 'botao-icone mapa-zoom', 'aria-label': 'Afastar o mapa' },
    el('span', { class: 'icone', 'data-icone': 'menos' })) as HTMLButtonElement
  const mais = el('button', { type: 'button', class: 'botao-icone mapa-zoom', 'aria-label': 'Aproximar o mapa' },
    el('span', { class: 'icone', 'data-icone': 'mais' })) as HTMLButtonElement
  menos.addEventListener('click', () => trocarZoom(-1))
  mais.addEventListener('click', () => trocarZoom(1))

  /*
   * Arrastar para mover. O clique no marcador continua funcionando porque só depois de a folga
   * ser vencida o gesto vira arraste — sem isso, qualquer tremida do dedo em cima de um medalhão
   * cancelaria a escolha.
   */
  let arrastando = false
  let mexeu = false
  let de = { x: 0, y: 0, sx: 0, sy: 0 }
  janela.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return
    arrastando = true
    mexeu = false
    de = { x: ev.clientX, y: ev.clientY, sx: janela.scrollLeft, sy: janela.scrollTop }
  })
  janela.addEventListener('pointermove', (ev) => {
    if (!arrastando) return
    const dx = ev.clientX - de.x
    const dy = ev.clientY - de.y
    if (!mexeu && Math.hypot(dx, dy) < FOLGA_ARRASTE) return
    mexeu = true
    janela.classList.add('mapa-arrastando')
    janela.scrollLeft = de.sx - dx
    janela.scrollTop = de.sy - dy
  })
  const soltar = (): void => { arrastando = false; janela.classList.remove('mapa-arrastando') }
  janela.addEventListener('pointerup', soltar)
  janela.addEventListener('pointercancel', soltar)
  janela.addEventListener('pointerleave', soltar)
  // Um arraste que termina em cima de um marcador não pode contar como escolha dele.
  janela.addEventListener('click', (ev) => { if (mexeu) { ev.stopPropagation(); ev.preventDefault() } }, true)

  aplicarZoom()

  return el('div', { class: 'mapa', 'data-regiao': regiaoId },
    janela,
    el('div', { class: 'mapa-controles' }, menos, mais))
}
