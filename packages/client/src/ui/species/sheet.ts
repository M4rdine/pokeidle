import type { AppContext } from '../../app-context.js'
import { displayName } from '../../state/log.js'
import { trainerProgress } from '../../state/progress.js'
import { comTipo, el, typeBadge } from '../dom.js'
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

  /*
   * Os três números em CARTÕES DE LEITURA, e no ALTO da ficha.
   *
   * Eram uma lista de definição no RODAPÉ, em corpo miúdo — a forma de nota de rodapé para os três
   * dados que mais decidem se vale caçar esta espécie. E lá embaixo eles chegavam depois da tabela
   * de golpes, que é a seção mais longa: quem abria a ficha para saber se pega fácil precisava
   * rolar até o fim para descobrir.
   */
  const captura = Math.round((species.captureRate / CAPTURA_MAX) * 100)
  const numeros = el('div', { class: 'ficha-leituras' },
    el('div', { class: 'cartao-leitura' }, el('span', {}, 'captura'), el('span', {}, `${captura}%`)),
    el('div', { class: 'cartao-leitura' }, el('span', {}, 'exp. base'), el('span', {}, String(species.baseExperience)),),
    el('div', { class: 'cartao-leitura' }, el('span', {}, 'crescimento'), el('span', {}, species.growthRate)))

  const evo = evolutionLine(ctx.registry, ctx.atlas, name)
  return el('div', { class: 'ficha' },
    el('header', { class: 'ficha-topo' },
      /*
       * O retrato mora num POÇO tingido pelo tipo — o mesmo do cartão do ativo e o mesmo dos
       * slots do time. Solto, um sprite de 64 px ao lado de um nome de 24 flutuava sem moldura e
       * era a única figura do jogo sem a caixa que todas as outras têm.
       */
      comTipo(el('span', { class: 'ficha-poco' }, spriteThumb(ctx.atlas, name, LADO_SPRITE)), species.types),
      el('div', { class: 'ficha-id' },
        el('div', { class: 'ficha-linha-nome' },
          el('h2', {}, displayName(name)),
          // O número vira CHIP: ele é um atributo da espécie, como o tipo, e como texto cinza
          // solto ao lado do nome ele lia como legenda de imagem.
          el('span', { class: 'chip chip-dex' }, `#${String(species.id).padStart(3, '0')}`)),
        el('div', { class: 'ficha-tipos' }, ...species.types.map(typeBadge)))),
    numeros,
    secao('Onde aparece', whereFound(ctx.registry, species, nivelDoTreinador(ctx))),
    secao('Atributos-base', statBars(species.baseStats)),
    ...(evo ? [secao('Evolução', evo)] : []),
    secao('Golpes', learnsetTable(ctx.registry, species)))
}
