import { evolutionChain, type ContentRegistry } from '@pokeidle/shared'
import { displayName } from '../../state/log.js'
import { el } from '../dom.js'
import { spriteThumb } from '../sprite-css.js'
import type { AtlasData } from '../../scene/atlas.js'

/** Lado do sprite de cada estágio, em pixels. */
const LADO = 32

/**
 * A linha evolutiva com o nível de cada passagem. O estágio aberto se destaca: a linha está aqui
 * como contexto — em que ponto da família este Pokémon está —, não como navegação.
 */
export function evolutionLine(registry: ContentRegistry, atlas: AtlasData, name: string): HTMLElement | null {
  const linha = evolutionChain(registry, name)
  // Um estágio só não é uma linha: mostrar "Butterfree →" sem seta nem destino seria ruído.
  if (linha.length < 2) return null
  return el('div', { class: 'ficha-evo' }, ...linha.flatMap((especie, i) => {
    const passagem = i > 0 ? linha[i - 1]!.evolvesTo?.level : undefined
    const seta = i === 0 ? [] : [el('span', { class: 'evo-seta muted' }, `nv ${passagem ?? '?'} →`)]
    return [
      ...seta,
      el('div', { class: `evo-estagio ${especie.name === name ? 'evo-atual' : ''}`.trim(), 'data-evo': especie.name },
        spriteThumb(atlas, especie.name, LADO),
        el('span', {}, displayName(especie.name))),
    ]
  }))
}
