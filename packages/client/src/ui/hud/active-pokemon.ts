import { xpForLevel } from '@pokeidle/shared'
import type { AppContext } from '../../app-context.js'
import { activePokemon } from '../../state/hunt-view.js'
import { displayName } from '../../state/log.js'
import { comTipo, el, pct } from '../dom.js'
import { spriteThumb } from '../sprite-css.js'

/** Lado do sprite do ativo, em pixels. Dobro da miniatura das listas: aqui ele é o assunto. */
const LADO_SPRITE = 64
/** Acima disto o HP é saudável; abaixo do segundo degrau é crítico. Leitura de instrumento. */
const HP_SAUDAVEL = 0.5
const HP_CRITICO = 0.2

const estadoDoHp = (hp: number, hpMax: number): string => {
  const fracao = hpMax > 0 ? hp / hpMax : 0
  if (fracao > HP_SAUDAVEL) return 'ok'
  return fracao > HP_CRITICO ? 'ferido' : 'critico'
}

/** Um medidor rotulado: rótulo e número na mesma linha, barra embaixo. */
function medidor(rotulo: string, valor: HTMLElement, barra: HTMLElement): HTMLElement {
  return el('div', { class: 'medidor' },
    el('div', { class: 'medidor-topo' }, el('span', {}, rotulo), valor), barra)
}

/** Cartão do Pokémon ativo: sprite, nome, nível, HP e XP até o próximo nível. */
export function mountActivePokemon(root: HTMLElement, ctx: AppContext): () => void {
  // O sprite vive numa caixa de tamanho fixo. Antes era `transform: scale(2)` solto, que mantinha
  // a caixa do tamanho do frame e transbordava por cima do nome — "Charizard L61" saía ilegível.
  const caixaSprite = el('div', { class: 'active-sprite-box' })
  // Nome e nível em elementos separados, como na faixa do time. O nível é VALOR, e valor não
  // pode ir na face de HUD: ela confunde 5 com 8, e "Charizard L65" saía na tela como "L68"
  // enquanto o rótulo do mundo, ao lado, dizia L65. Separar também alinha as duas superfícies
  // que mostram o mesmo Pokémon.
  const nome = el('span', { 'data-name': '' }, 'sem Pokémon em campo')
  const nivel = el('span', { class: 'chip chip-nivel', 'data-level': '', hidden: '' })
  const title = el('h2', { class: 'active-nome' }, nome, nivel)
  const hp = el('progress', { class: 'hp-bar', 'data-hp': '', 'data-hp-state': 'ok', max: '1', value: '0' })
  const hpText = el('span', { 'data-hp-text': '' }, '—')
  const xp = el('progress', { class: 'xp-bar', 'data-xp': '', max: '100', value: '0' })
  const xpText = el('span', { class: 'muted', 'data-xp-text': '' }, '—')
  const corpo = el('div', { class: 'active-corpo' }, medidor('HP', hpText, hp), medidor('XP', xpText, xp))
  root.append(el('section', { class: 'active-card panel' },
    el('div', { class: 'active-topo' }, caixaSprite, title), corpo))

  let species = ''
  return ctx.hunt.subscribe(activePokemon, (active) => {
    if (!active) {
      // Estado vazio com palavra, não travessão: quem chega e vê "—" não sabe se quebrou ou se
      // ainda não começou.
      nome.textContent = 'sem Pokémon em campo'
      nivel.hidden = true
      corpo.hidden = true
      caixaSprite.replaceChildren()
      species = ''
      return
    }
    corpo.hidden = false
    if (active.speciesName !== species) {
      species = active.speciesName
      caixaSprite.replaceChildren(spriteThumb(ctx.atlas, species, LADO_SPRITE))
      comTipo(caixaSprite, ctx.registry.species.get(species)?.types ?? [])
    }
    nome.textContent = displayName(active.speciesName)
    nivel.textContent = `nv ${active.level}`
    nivel.hidden = false
    hp.setAttribute('max', String(active.hpMax))
    hp.setAttribute('value', String(active.hp))
    hp.setAttribute('data-hp-state', estadoDoHp(active.hp, active.hpMax))
    hpText.textContent = `${active.hp}/${active.hpMax}`
    const growth = ctx.registry.species.get(active.speciesName)?.growthRate ?? 'medium-fast'
    const floor = xpForLevel(growth, active.level)
    const span = xpForLevel(growth, active.level + 1) - floor
    const dentro = pct(Math.max(0, active.xp - floor), span)
    xp.setAttribute('value', String(dentro))
    xpText.textContent = `${dentro}%`
  })
}
