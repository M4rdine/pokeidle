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

  return el('div', { class: 'mapa', 'data-regiao': regiaoId },
    imagem,
    el('div', { class: 'mapa-marcadores' }, ...marcadores))
}
