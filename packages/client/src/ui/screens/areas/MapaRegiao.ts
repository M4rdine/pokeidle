/**
 * O mapa da região, com um marcador por área. É a tela de escolher destino.
 *
 * TESE: o mapa É a interface. Não há lista, não há sanfona, não há tabela ao lado do mapa
 * disputando com ele — o jogador olha o mundo, passa o ponteiro por um marcador e lê o veredito.
 *
 * O FUNDO É O TOWN MAP OFICIAL, e essa é a decisão que fez a tela funcionar. Antes era o PNG que
 * o nosso pipeline gera do tileset (`pnpm assets region-preview`): fiel ao mapa jogável, e
 * ilegível como mapa de região — manchas de verde e cinza sem marco nenhum, onde ninguém
 * reconhece onde está. Mapa de região não serve para mostrar o terreno, serve para a pessoa se
 * LOCALIZAR, e para isso ele precisa ter os lugares que ela já conhece.
 *
 * O preço disso é que a posição da área deixou de ser derivada do `anchor` no mundo jogável e
 * passou a ser DADO, em `regions.json` (`noMapa`). É mais uma coisa para manter em dia — e o
 * schema recusa duas áreas no mesmo ponto, porque marcador em cima de marcador some da tela sem
 * nada denunciar.
 */
import type { AtlasData } from '../../../scene/atlas.js'
import { el } from '../../dom.js'
import { spriteThumb } from '../../sprite-css.js'
import { townMap } from './town-maps.js'
import type { AreaEstimate } from '@pokeidle/shared'

/** O que a tela de escolher destino sabe sobre uma área. */
export interface AreaView {
  readonly id: string
  readonly name: string
  readonly minLevel: number
  readonly maxLevel: number
  readonly minTrainerLevel: number
  readonly locked: boolean
  readonly species: readonly string[]
  /** Degrau de raridade: explica por que uma área difícil compensa. */
  readonly rarity: number
  readonly estimate: AreaEstimate
}

/** Onde a área cai no Town Map, em porcentagem da imagem. */
export interface PontoNoMapa {
  readonly x: number
  readonly y: number
  readonly local: string
}

export interface AreaNoMapa extends AreaView {
  readonly noMapa: PontoNoMapa
}

interface Props {
  readonly regiaoId: string
  readonly regiaoNome: string
  readonly townMapId: string
  readonly atlas: AtlasData
  readonly areas: readonly AreaNoMapa[]
  readonly selecionada: string | null
  readonly aoEscolher: (areaId: string) => void
}

/** Lado do sprite dentro do marcador, em pixels. */
const LADO_SPRITE = 26

/**
 * O que o marcador diz a quem não o vê — e o que aparece ao passar o ponteiro.
 *
 * O nome sozinho não decide nada: quem olha o mapa está perguntando "dá para ir agora, e o que
 * mora ali". As duas respostas são o nível e o portão, e o marco serve para a pessoa achar no
 * mapa o que acabou de ler.
 */
const descricao = (area: AreaNoMapa): string => area.locked
  ? `${area.name} (${area.noMapa.local}) — abre no nível ${area.minTrainerLevel}`
  : `${area.name} (${area.noMapa.local}) — níveis ${area.minLevel} a ${area.maxLevel}`

export function mapaRegiao(props: Props): HTMLElement {
  const { regiaoId, regiaoNome, townMapId, areas, selecionada, aoEscolher } = props

  const arte = townMap(townMapId)
  if (arte === null) {
    return el('p', { class: 'muted' }, `A região ${regiaoNome} ainda não tem mapa desenhado.`)
  }

  const imagem = el('img', {
    class: 'mapa-imagem',
    src: arte,
    alt: `Mapa de ${regiaoNome}`,
    width: '192', height: '144',
    loading: 'eager',
    decoding: 'async',
  })

  const marcadores = areas.map((area) => {
    const classes = ['mapa-marcador']
    if (area.locked) classes.push('mapa-marcador-travado')
    if (area.id === selecionada) classes.push('mapa-marcador-ativo')
    const botao = el('button', {
      type: 'button',
      class: classes.join(' '),
      'data-area': area.id,
      'aria-pressed': area.id === selecionada ? 'true' : 'false',
      'aria-label': descricao(area),
    },
      // O sprite da primeira espécie, e não o nome da área: quem olha o mapa quer saber O QUE
      // mora ali. "Bosque Denso" não diz; um Butterfree diz na hora, e no idioma do jogo.
      el('span', { class: 'mapa-medalha' },
        area.species[0] ? spriteThumb(props.atlas, area.species[0], LADO_SPRITE) : el('span', { class: 'sprite-unknown' })),
      // A etiqueta só aparece no hover, no foco e na escolhida. Dezesseis etiquetas acesas ao
      // mesmo tempo são o que transformava o mapa em mural de números — e o nível de uma área
      // que a pessoa não está olhando não decide nada.
      el('span', { class: 'mapa-etiqueta', 'aria-hidden': 'true' },
        el('span', { class: 'mapa-etiqueta-nome' }, area.name),
        el('span', { class: 'mapa-etiqueta-nivel' },
          area.locked ? `abre nv ${area.minTrainerLevel}` : `nv ${area.minLevel}–${area.maxLevel}`)))
    // Porcentagem: a imagem escala com a largura do modal e o marcador acompanha sem recalcular.
    botao.style.setProperty('left', `${area.noMapa.x}%`)
    botao.style.setProperty('top', `${area.noMapa.y}%`)
    botao.addEventListener('click', () => aoEscolher(area.id))
    return botao
  })

  /*
   * Sem zoom e sem arraste. Os dois existiam porque o mapa anterior era um render de 96×72 tiles
   * cheio de detalhe que não cabia na janela. O Town Map tem 192×144 e cabe inteiro em qualquer
   * largura de modal: zoom não teria para onde aproximar e arraste não teria para onde arrastar.
   * Eram dois controles ocupando o canto do mapa para não fazer nada.
   */
  return el('div', { class: 'mapa', 'data-regiao': regiaoId },
    el('div', { class: 'mapa-mundo' }, imagem, el('div', { class: 'mapa-marcadores' }, ...marcadores)))
}
