import { evolutionChain, type ContentRegistry } from '@pokeidle/shared'
import { displayName } from '../../state/log.js'
import { comTipo, el } from '../dom.js'
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
    /*
     * A passagem entre dois estágios é um NÍVEL ou uma PEDRA, e a seta diz qual. Mostrar "nv ?"
     * para quem evolui por pedra era a resposta errada com cara de dado faltando — o jogador
     * concluiria que o registro está incompleto, quando na verdade a regra é outra.
     */
    const evo = i > 0 ? linha[i - 1]!.evolvesTo : undefined
    const passagem = evo === undefined ? '?'
      : 'level' in evo ? `nv ${evo.level}`
        : registry.items.get(evo.item)?.name ?? evo.item
    const seta = i === 0 ? [] : [el('span', { class: 'evo-seta muted' }, `${passagem} →`)]
    return [
      ...seta,
      // O retrato no POÇO tingido pelo tipo, como em toda figura desta casa. Solto, o sprite era a
      // única imagem da ficha sem a caixa que o cabeçalho logo acima dela tem.
      el('div', { class: `evo-estagio ${especie.name === name ? 'evo-atual' : ''}`.trim(), 'data-evo': especie.name },
        comTipo(el('span', { class: 'evo-poco' }, spriteThumb(atlas, especie.name, LADO)), especie.types),
        el('span', {}, displayName(especie.name))),
    ]
  }))
}
