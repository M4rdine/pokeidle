import type { ContentRegistry, Species } from '@pokeidle/shared'
import { displayName } from '../../state/log.js'
import { el, typeBadge } from '../dom.js'

/**
 * Os golpes que a espécie aprende, do primeiro ao último nível. O poder e o tipo entram porque a
 * pergunta real não é "o que ela aprende" e sim "vale a pena subir mais alguns níveis".
 */
export function learnsetTable(registry: ContentRegistry, species: Species): HTMLElement {
  const ordenado = [...species.learnset].sort((a, b) => a.level - b.level || a.move.localeCompare(b.move))
  return el('ul', { class: 'ficha-learnset' }, ...ordenado.map(({ move, level }) => {
    const dados = registry.moves.get(move)
    return el('li', { class: 'learn-linha', 'data-learn': move },
      el('span', { class: 'learn-nivel muted' }, `nv ${level}`),
      el('span', { class: 'learn-nome' }, displayName(move)),
      ...(dados ? [typeBadge(dados.type), el('span', { class: 'learn-poder muted' }, `poder ${dados.power}`)] : []))
  }))
}
