import { areasOfSpecies, type ContentRegistry, type Species } from '@pokeidle/shared'
import { el } from '../dom.js'

const ORIGEM: Readonly<Record<string, string>> = {
  starter: 'Inicial: chega na escolha do primeiro Pokémon, não aparece selvagem.',
  legendary: 'Lendário: não aparece selvagem em área nenhuma.',
}

/**
 * Onde caçar a espécie. É a parte da ficha que vira decisão — o resto é contexto —, então cada
 * linha traz a faixa de nível dos selvagens e o nível de treinador que a área exige.
 */
export function whereFound(registry: ContentRegistry, species: Species, nivelDoTreinador: number): HTMLElement {
  const onde = areasOfSpecies(registry.regions, species.name)
  if (onde.length === 0) {
    // Lista vazia não é o mesmo que "ainda não achei": inicial e lendário têm outra porta de
    // entrada, e dizer isso é mais útil do que mostrar um espaço em branco.
    const motivo = species.obtainable === undefined ? 'Não aparece em área nenhuma.' : ORIGEM[species.obtainable]
    return el('p', { class: 'muted ficha-vazio' }, motivo ?? 'Não aparece em área nenhuma.')
  }
  return el('ul', { class: 'ficha-areas' }, ...onde.map(({ region, area }) => {
    const porta = Math.max(region.minTrainerLevel, area.minTrainerLevel)
    return el('li', { class: 'ficha-area', 'data-area': area.id },
      el('span', { class: 'area-nome' }, area.name),
      el('span', { class: 'muted' }, region.name),
      el('span', { class: 'area-faixa' }, `nv ${area.minLevel}–${area.maxLevel}`),
      // A cor do portão é leitura, não enfeite: acesa quer dizer "ainda não dá", apagada quer
      // dizer "pode ir agora". Acender as duas gastaria o acento à toa.
      el('span', { class: porta > nivelDoTreinador ? 'area-porta porta-longe' : 'area-porta muted' },
        `entra com nv ${porta}`))
  }))
}
