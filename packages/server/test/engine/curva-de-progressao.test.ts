/**
 * A curva de progressão das dezesseis áreas, medida rodando o motor.
 *
 * Existe porque o jogo estava punindo quem progredia e ninguém via. A última área rendia 262 mil
 * XP/h contra 1,9 milhão de uma vinte níveis antes, e derrubava cinco vezes em dez minutos um
 * time do próprio nível dela. Nada disso aparece lendo `regions.json`: são três números por área
 * que se multiplicam com a matchup de tipo do elenco.
 *
 * A régua completa, com o degrau entre áreas, sai em `pnpm balanco`. Aqui ficam os contratos que
 * não podem voltar a quebrar.
 */
import { createRng, hpAt, loadRegistry, xpForLevel, type Area } from '@pokeidle/shared'
import { describe, expect, it } from 'vitest'
import { createHuntState, defaultSettings } from '../../src/engine/create.js'
import { simulate, summarizeEvents } from '../../src/engine/simulate.js'

const registry = loadRegistry()
const TICKS = 3000
const HORAS = TICKS / 5 / 3600
/**
 * Três sementes, como em `pnpm balanco`. Com uma só, o teste mede a SORTE daquela caçada: no seed
 * 42 o `pico-rochoso` derruba uma vez e nos outros dois nenhuma. Uma queda em dez minutos é azar;
 * o que interessa é a área derrubar de forma consistente.
 */
const SEEDS = [42, 9, 7] as const
const TIME = ['charizard', 'blastoise', 'venusaur'] as const

const membro = (nome: string, level: number, i: number) => {
  const hp = hpAt(registry.species.get(nome)!.baseStats.hp, level)
  return { id: `p${i}`, speciesName: nome, level, xp: xpForLevel('medium-slow', level), hp, hpMax: hp }
}

/**
 * A bolsa que a LOJA oferece a quem chega nesta área — e este detalhe dominava a medição inteira.
 * Com Poção comum, que é a bolsa de quem acabou de começar, `mata-fechada` media 922 mil XP/h;
 * com Hiper Poção, que a loja libera no nível 30 e portanto qualquer jogador ali já compra, ela
 * mede 4,85 milhões. Cinco vezes de diferença — medir o fim do jogo com equipamento do começo
 * acusa como "quebrada" uma área que está sã.
 */
function bolsaDe(area: Area): Record<string, number> {
  const itens = registry.unlocks.items
  const nivel = area.minTrainerLevel
  const pocao = nivel >= (itens['hyper-potion'] ?? Infinity) ? 'hyper-potion'
    : nivel >= (itens['super-potion'] ?? Infinity) ? 'super-potion'
      : 'potion'
  return { [pocao]: 99, 'poke-ball': 20 }
}

const medir = (area: Area) => {
  const corridas = SEEDS.map((seed) => {
    const hunt = registry.hunts.get(area.id)!
    const deps = { registry, hunt, rng: createRng(seed) }
    const team = TIME.map((n, i) => membro(n, area.maxLevel, i))
    const s0 = createHuntState(
      { hunt, sessionId: 'curva', team, inventory: bolsaDe(area), settings: defaultSettings() }, deps)
    return summarizeEvents(simulate(s0, TICKS, deps).events, TICKS)
  })
  const media = (f: (s: (typeof corridas)[number]) => number): number =>
    corridas.reduce((total, s) => total + f(s), 0) / corridas.length
  return { xpPorHora: media((s) => s.xpTrainer) / HORAS, quedas: media((s) => s.faints) }
}

const emOrdem = (): readonly Area[] =>
  [...registry.regions.values()].sort((a, b) => a.order - b.order).flatMap((r) => r.areas)

describe('a curva de progressão das dezesseis áreas', () => {
  // Memo, e não cálculo no corpo do `describe`: ali ele roda na COLETA, fora do prazo de qualquer
  // caso, e uma suíte que estoura na coleta não diz qual teste falhou.
  let cache: readonly { area: Area; xpPorHora: number; quedas: number }[] | null = null
  const medidas = (): readonly { area: Area; xpPorHora: number; quedas: number }[] =>
    (cache ??= emOrdem().map((area) => ({ area, ...medir(area) })))

  it('nenhuma área derruba um time do nível dela', () => {
    /*
     * Queda é o defeito mais caro do jogo: o time volta ao Centro e a caçada vira ida e volta.
     * Duas áreas faziam isso — `usina-velha`, onde o Thunderbolt do Raichu tirava 83% do HP do
     * Charizard, e `cume-indigo`, onde o Hyper Beam do Snorlax tirava metade de todo mundo. O
     * motor só troca de Pokémon quando o ativo CAI, então um contra-tipo duro não tem resposta.
     */
    const armadilhas = medidas().filter((m) => m.quedas > 0.5).map((m) => `${m.area.id}: ${m.quedas} quedas`)
    expect(armadilhas).toEqual([])
  }, 120_000)

  it('a última área do jogo rende mais que qualquer área de Kanto', () => {
    // O contrato mais simples de "progredir compensa". Ele reprovava por SETE VEZES: a última
    // área rendia 262 mil e `campo-safari`, vinte níveis antes, rendia 1,9 milhão.
    const todas = medidas()
    const ultima = todas[todas.length - 1]!
    const tetoDeKanto = Math.max(...todas.filter((m) => m.area.rarity <= 8 && m.area.maxLevel <= 35).map((m) => m.xpPorHora))
    expect(ultima.xpPorHora).toBeGreaterThan(tetoDeKanto)
  }, 120_000)

  it('nenhuma área rende menos de 70% da anterior', () => {
    /*
     * Setenta por cento, e não cem. Monotonia estrita não é alcançável só com os números de
     * spawn: entre um elenco manso e um duro há 2,4× de diferença de vazão, e isso engole
     * qualquer degrau que a densidade consiga dar. O que este teste barra é o DESPENHADEIRO — a
     * área que rende uma fração da anterior —, que é o que o jogo tinha em quatro lugares.
     */
    const todas = medidas()
    const despenhadeiros = todas.flatMap((m, i) => {
      if (i === 0) return []
      const razao = m.xpPorHora / todas[i - 1]!.xpPorHora
      return razao < 0.7 ? [`${m.area.id}: ${(razao * 100).toFixed(0)}% da anterior`] : []
    })
    expect(despenhadeiros).toEqual([])
  }, 120_000)
})
