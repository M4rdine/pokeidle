import type { AppContext } from '../../app-context.js'
import { displayName } from '../../state/log.js'
import { trainerProgress } from '../../state/progress.js'
import { el, typeBadge } from '../dom.js'
import { spriteThumb } from '../sprite-css.js'
import { evolutionLine } from './evolution.js'
import { learnsetTable } from './learnset.js'
import { statBars } from './stats.js'
import { whereFound } from './where.js'

/** Lado do sprite do cabeçalho, em pixels. */
const LADO_SPRITE = 64
/** Taxa de captura máxima do formato; vira porcentagem só para dar escala a quem lê. */
const CAPTURA_MAX = 255

/** Nível do treinador agora: o espelho da hunt manda enquanto ela roda, senão vale o `/me`. */
function nivelDoTreinador(ctx: AppContext): number {
  const xp = ctx.hunt.get().state?.trainer.xp ?? ctx.session.get().me?.trainer.xp ?? 0
  return trainerProgress(ctx.registry, xp).level
}

const secao = (titulo: string, corpo: HTMLElement): HTMLElement =>
  el('section', { class: 'ficha-secao' }, el('h3', {}, titulo), corpo)

/**
 * Ficha de uma espécie: quem é, onde se caça, do que é feita, o que aprende e em que ponto da
 * linha evolutiva está.
 *
 * Devolve um elemento em vez de abrir um modal de propósito. Quem chama decide onde ela mora — a
 * Pokédex e o Time a mostram por dentro dos próprios modais, e abrir um segundo modal fecharia o
 * primeiro e faria o jogador perder o lugar na lista.
 */
export function speciesSheet(ctx: AppContext, name: string): HTMLElement {
  const species = ctx.registry.species.get(name)
  if (!species) {
    return el('div', { class: 'ficha' }, el('p', { class: 'muted' }, `Espécie não encontrada: ${name}`))
  }

  const captura = Math.round((species.captureRate / CAPTURA_MAX) * 100)
  const numeros = el('dl', { class: 'ficha-numeros' },
    el('dt', {}, 'captura'), el('dd', {}, `${captura}%`),
    el('dt', {}, 'exp. base'), el('dd', {}, String(species.baseExperience)),
    el('dt', {}, 'crescimento'), el('dd', {}, species.growthRate))

  const evo = evolutionLine(ctx.registry, ctx.atlas, name)
  return el('div', { class: 'ficha' },
    el('header', { class: 'ficha-topo' },
      spriteThumb(ctx.atlas, name, LADO_SPRITE),
      el('div', { class: 'ficha-id' },
        el('h2', {}, displayName(name)),
        el('span', { class: 'muted' }, `#${species.id}`),
        el('div', { class: 'ficha-tipos' }, ...species.types.map(typeBadge)))),
    secao('Onde aparece', whereFound(ctx.registry, species, nivelDoTreinador(ctx))),
    secao('Atributos-base', statBars(species.baseStats)),
    ...(evo ? [secao('Evolução', evo)] : []),
    secao('Golpes', learnsetTable(ctx.registry, species)),
    numeros)
}
