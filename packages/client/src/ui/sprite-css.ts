import type { AtlasData } from '../scene/atlas.js'
import { frameOf } from '../scene/atlas.js'

export type SpriteStyle = Readonly<Record<string, string>>

/** Propriedades CSS do primeiro frame de `walk_south`, ou null quando a espécie não está no atlas. */
export function spriteStyle(atlas: AtlasData, species: string): SpriteStyle | null {
  const frame = frameOf(atlas, species, 'south', 0)
  if (!frame) return null
  return {
    'background-image': `url(/assets/atlas/${atlas.pokemon.meta.image})`,
    'background-position': `-${frame.x}px -${frame.y}px`.replace('-0px', '0px'),
    width: `${frame.w}px`,
    height: `${frame.h}px`,
  }
}

/**
 * Miniatura de tamanho fixo. Os frames do atlas têm 32 ou 64 px conforme a espécie, e o estilo
 * do sprite grava a largura do frame direto no elemento: sem uma caixa que recorte e escale, um
 * Rhydon de 64 px invade a coluna vizinha da ficha de áreas.
 *
 * A ESCALA VEM DO MAIOR LADO, não da largura. Com a largura, um quadro mais alto que largo
 * transbordava a caixa por baixo; um mais largo que alto era desenhado menor do que a caixa
 * comporta. O atlas deveria só ter quadros quadrados — há um teste para isso —, mas quem escala
 * pelo lado errado só descobre o quadro torto quando alguém repara a olho nu, que foi como o
 * Charmander apareceu pela metade do tamanho na tela do inicial.
 */
export function spriteThumb(atlas: AtlasData, species: string, size = 32): HTMLElement {
  const box = document.createElement('span')
  box.className = 'sprite-thumb'
  box.style.setProperty('width', `${size}px`)
  box.style.setProperty('height', `${size}px`)
  const inner = document.createElement('span')
  const style = spriteStyle(atlas, species)
  if (!style) {
    inner.classList.add('sprite-unknown')
  } else {
    for (const [property, value] of Object.entries(style)) inner.style.setProperty(property, value)
    const lado = Math.max(
      Number.parseInt(style['width'] ?? `${size}`, 10) || size,
      Number.parseInt(style['height'] ?? `${size}`, 10) || size,
    )
    inner.style.setProperty('transform', `scale(${size / lado})`)
  }
  box.append(inner)
  return box
}
