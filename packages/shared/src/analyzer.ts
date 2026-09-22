/**
 * Analisador de área: responde "vale a pena caçar aqui?" com XP e ouro por hora, confronto de
 * tipo e o que falta na Pokédex. É aproximação declarada, não simulação — usa as mesmas fórmulas
 * do motor, mas com nível médio, dano esperado e tempo fixo de deslocamento. O número serve para
 * comparar áreas entre si; a caçada real varia com a seed.
 */
import { captureChance } from './capture.js'
import { bestMove, expectedDamage, typeMultiplier, type Combatant } from './damage.js'
import { dropChance, lootTableFor, MIN_RARITY } from './loot.js'
import { availableMoves, cooldownTicks } from './moves.js'
import type { Registry } from './registry.js'
import type { Species } from './schemas/species.js'
import { statsAt } from './stats.js'
import { xpOnDefeat } from './xp.js'

const SECONDS_PER_HOUR = 3600
const TICKS_PER_SECOND = 5
/**
 * Ticks gastos andando até o próximo selvagem. O jogador anda um tile por tick e os spawns de
 * uma área ficam num retângulo de oito tiles de lado, então meia travessia é o valor honesto.
 */
const WALK_TICKS_PER_DEFEAT = 8
/** HP em que a captura é tentada, como fração do máximo: é o padrão das configurações do treinador. */
const CAPTURE_HP_FRACTION = 0.3
/**
 * `expectedDamage` fixa o fator aleatório no máximo; na caçada ele sorteia entre 0,85 e 1,0.
 * A média é o que interessa para estimar quantos golpes o alvo aguenta.
 */
const AVERAGE_ROLL = 0.925
const DEFAULT_BALL_BONUS = 1
/**
 * Quanto uma poção devolve, como fração do máximo — a Poção comum, que é o piso do que o jogador
 * carrega. Assumir a melhor faria o analisador prometer o melhor caso.
 */
const CURA_POR_POCAO = 0.2
/** Uma poção custa o tique em que ela é usada: nele o time cura em vez de atacar. */
const TICKS_POR_POCAO = 1

export interface AreaSpecies {
  readonly species: readonly string[]
  readonly minLevel: number
  readonly maxLevel: number
  /** Degrau de raridade da área: multiplica a chance dos drops. */
  readonly rarity?: number
  /** Quantos selvagens a área mantém vivos ao mesmo tempo. */
  readonly wildCount: number
  /** Tempo de renascimento do spawn mais lento. */
  readonly respawnSeconds: number
}

export interface TeamMember {
  readonly speciesName: string
  readonly level: number
}

export interface EstimateInput {
  readonly registry: Pick<Registry, 'species' | 'moves' | 'typeChart' | 'loot'>
  readonly area: AreaSpecies
  readonly team: readonly TeamMember[]
  /** Espécies já capturadas; o que não estiver aqui entra em `missing`. */
  readonly caught?: readonly string[]
  /** Bônus da melhor bola disponível (1 = Poké Bola). */
  readonly ballBonus?: number
}

export interface DropEstimate {
  readonly item: string
  /** Chance já ajustada pelo degrau de raridade da área. */
  readonly chance: number
}

export interface SpeciesEstimate {
  readonly speciesName: string
  /** Nível médio da faixa da área. */
  readonly level: number
  readonly xpPerDefeat: number
  readonly goldPerDefeat: number
  /** `null` quando o time não fere a espécie — nenhum número é melhor que um número falso. */
  readonly secondsPerDefeat: number | null
  /** Multiplicador de tipo do melhor golpe do time contra esta espécie. */
  readonly matchup: number
  readonly captureChance: number
  /** O que a espécie derruba nesta área, com a chance do degrau dela. */
  readonly drops: readonly DropEstimate[]
}

export interface AreaEstimate {
  readonly xpPerHour: number
  readonly goldPerHour: number
  /** Média dos confrontos por espécie. */
  readonly matchup: number
  readonly missing: readonly string[]
  readonly species: readonly SpeciesEstimate[]
}

const media = (valores: readonly number[]): number =>
  valores.length === 0 ? 0 : valores.reduce((a, b) => a + b, 0) / valores.length

const combatente = (species: Species, level: number): Combatant =>
  ({ level, types: species.types, stats: statsAt(species.baseStats, level) })

interface Golpe {
  readonly damage: number
  readonly ticks: number
  readonly matchup: number
}

/**
 * Quanto o SELVAGEM devolve por golpe, contra o membro mais frágil do time diante dele — e qual é
 * o HP desse membro.
 *
 * Existe porque o analisador ignorava a cura, e por isso mentia justamente onde importa: numa
 * área cujo elenco bate forte, o tempo da caçada é gasto bebendo poção, não atacando. Medido no
 * motor, duas áreas rendiam 40% do que o analisador prometia — e o jogador escolhe a área por
 * esse número.
 */
function troco(input: EstimateInput, alvo: Combatant, alvoSpecies: Species): { readonly dano: number; readonly hpMax: number } {
  const { registry, team } = input
  let pior = { dano: 0, hpMax: 1 }
  for (const membro of team) {
    const species = registry.species.get(membro.speciesName)
    if (!species) continue
    const nosso = combatente(species, membro.level)
    const move = bestMove(availableMoves(alvoSpecies, alvo.level, registry.moves), alvo, nosso, registry.typeChart)
    if (!move) continue
    const dano = expectedDamage(alvo, nosso, move, registry.typeChart) * AVERAGE_ROLL
    if (dano / nosso.stats.hp > pior.dano / pior.hpMax) pior = { dano, hpMax: nosso.stats.hp }
  }
  return pior
}

/** O melhor golpe que o time tem contra este alvo, com o tempo que ele custa. */
function melhorGolpe(input: EstimateInput, alvo: Combatant, alvoSpecies: Species): Golpe | null {
  const { registry, team } = input
  let melhor: Golpe | null = null
  for (const membro of team) {
    const species = registry.species.get(membro.speciesName)
    if (!species) continue
    const atacante = combatente(species, membro.level)
    const candidatos = availableMoves(species, membro.level, registry.moves)
    const move = bestMove(candidatos, atacante, alvo, registry.typeChart)
    if (!move) continue
    const damage = expectedDamage(atacante, alvo, move, registry.typeChart)
    if (damage <= 0) continue
    const golpe = {
      damage,
      ticks: cooldownTicks(move),
      matchup: typeMultiplier(registry.typeChart, move.type, alvoSpecies.types),
    }
    if (melhor === null || golpe.damage / golpe.ticks > melhor.damage / melhor.ticks) melhor = golpe
  }
  return melhor
}

function estimarEspecie(input: EstimateInput, nome: string, level: number): SpeciesEstimate | null {
  const rarity = input.area.rarity ?? MIN_RARITY
  const species = input.registry.species.get(nome)
  if (!species) return null
  const alvo = combatente(species, level)
  const golpe = melhorGolpe(input, alvo, species)
  const table = lootTableFor(species, input.registry.loot)
  const hpMax = alvo.stats.hp
  // O primeiro golpe sai no tick em que o jogador encosta no selvagem; só os seguintes esperam
  // o tempo de recarga. Contar N recargas para N golpes dobrava o tempo estimado.
  const golpes = golpe === null ? null : Math.ceil(hpMax / (golpe.damage * AVERAGE_ROLL))
  /*
   * O tempo de CURA entra no tempo por derrota. O selvagem revida a cada troca de golpes, e cada
   * poção custa o tique em que é bebida. Sem este termo o analisador conta só o combate e promete
   * um número que a área não entrega — e ele é justamente o número pelo qual o jogador escolhe.
   *
   * Fica de fora a volta ao Centro, que acontece quando a poção não dá conta. É simplificação
   * declarada, e ela erra para MENOS tempo, ou seja, o analisador ainda promete um teto.
   */
  const revide = troco(input, alvo, species)
  const pocoes = golpes === null || revide.dano === 0
    ? 0
    : (golpes * revide.dano) / (CURA_POR_POCAO * revide.hpMax)
  const ticksDeLuta = golpe === null || golpes === null
    ? null
    : (golpes - 1) * golpe.ticks + pocoes * TICKS_POR_POCAO

  return {
    speciesName: nome,
    level,
    xpPerDefeat: xpOnDefeat(species, level),
    goldPerDefeat: Math.round((table.gold[0] + table.gold[1]) / 2),
    secondsPerDefeat: ticksDeLuta === null ? null : (ticksDeLuta + WALK_TICKS_PER_DEFEAT) / TICKS_PER_SECOND,
    matchup: golpe?.matchup ?? 0,
    captureChance: captureChance({
      captureRate: species.captureRate,
      hpMax,
      hpCurrent: Math.floor(hpMax * CAPTURE_HP_FRACTION),
      ballBonus: input.ballBonus ?? DEFAULT_BALL_BONUS,
    }),
    drops: table.drops.map((d) => ({ item: d.item, chance: dropChance(d.chance, rarity) })),
  }
}

export function estimateArea(input: EstimateInput): AreaEstimate {
  const { area, caught } = input
  const level = Math.floor((area.minLevel + area.maxLevel) / 2)
  const species = area.species
    .map((nome) => estimarEspecie(input, nome, level))
    .filter((s): s is SpeciesEstimate => s !== null)

  // Teto de renascimento: por mais rápido que o time seja, a área só devolve `wildCount`
  // selvagens a cada `respawnSeconds`. Sem isto uma área de sete selvagens parecia render quatro
  // vezes o que rende de verdade.
  const derrotasPorHoraNoTeto = (area.wildCount * SECONDS_PER_HOUR) / area.respawnSeconds
  const porHora = (valor: (s: SpeciesEstimate) => number): number => {
    const porSegundo = media(species.map((s) => (s.secondsPerDefeat === null ? 0 : 1 / s.secondsPerDefeat)))
    if (porSegundo === 0) return 0
    const derrotasPorHora = Math.min(porSegundo * SECONDS_PER_HOUR, derrotasPorHoraNoTeto)
    return Math.round(derrotasPorHora * media(species.map(valor)))
  }

  const jaTem = new Set(caught ?? [])
  return {
    xpPerHour: porHora((s) => s.xpPerDefeat),
    goldPerHour: porHora((s) => s.goldPerDefeat),
    matchup: media(species.map((s) => s.matchup)),
    missing: area.species.filter((nome) => !jaTem.has(nome)),
    species,
  }
}
