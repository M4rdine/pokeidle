import type { BaseStats } from '@pokeidle/shared'
import { el } from '../dom.js'

/** Teto da escala das barras: o maior atributo-base da série chega perto de 255. */
const TETO = 180
const ROTULOS: readonly (readonly [keyof BaseStats, string])[] = [
  ['hp', 'HP'], ['attack', 'Ataque'], ['defense', 'Defesa'],
  ['spAttack', 'At. esp.'], ['spDefense', 'Def. esp.'], ['speed', 'Velocidade'],
]

/**
 * Os seis atributos-base em barras comparáveis. A mesma escala nas seis é o ponto: o que se lê
 * aqui é o formato da espécie — rápida e frágil, lenta e dura — e isso só aparece se as barras
 * dividirem o teto.
 */
export function statBars(base: BaseStats): HTMLElement {
  return el('div', { class: 'ficha-stats' }, ...ROTULOS.map(([chave, rotulo]) => {
    const valor = base[chave]
    const barra = el('div', { class: 'stat-barra' })
    barra.style.setProperty('--fracao', String(Math.min(1, valor / TETO)))
    /*
     * O NÚMERO VAI DEPOIS DA BARRA, não entre o rótulo e ela.
     *
     * No meio, os seis números caíam numa coluna estreita espremida contra as barras, e o olho
     * tinha que atravessar o número para chegar ao comprimento — que é o dado que realmente se
     * compara aqui. Encostados à direita, os seis formam uma coluna própria, e a barra fica
     * contínua da esquerda até ela.
     */
    return el('div', { class: 'stat-linha', 'data-stat': chave },
      el('span', { class: 'stat-rotulo' }, rotulo),
      barra,
      el('span', { class: 'stat-valor' }, String(valor)))
  }))
}
