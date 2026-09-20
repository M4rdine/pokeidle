import { findArea, hpAt, levelFromXp, MIN_RARITY, nextEvolution, rollLoot, xpForLevel, xpOnDefeat, type Registry, type Species } from '@pokeidle/shared'
import { TICKS_PER_SECOND } from './constants.js'
import type { EngineDeps, Event, HuntState, PokemonState, StepResult, WildState } from './types.js'

function speciesOf(registry: Registry, name: string): Species {
  const s = registry.species.get(name)
  if (!s) throw new Error(`espécie ${name} não existe no registro`)
  return s
}

export function makePokemon(registry: Registry, id: string, speciesName: string, level: number): PokemonState {
  const species = speciesOf(registry, speciesName)
  const hpMax = hpAt(species.baseStats.hp, level)
  return { id, speciesName, level, xp: xpForLevel(species.growthRate, level), hp: hpMax, hpMax }
}

export function gainXp(pokemon: PokemonState, amount: number, registry: Registry, tick: number): { pokemon: PokemonState; events: Event[] } {
  const xp = pokemon.xp + amount
  let species = speciesOf(registry, pokemon.speciesName)
  // Nível calculado com a curva da espécie ANTES da evolução; correto enquanto evoluções mantêm o growthRate (verdade para a Gen 1).
  const newLevel = levelFromXp(species.growthRate, xp)
  const events: Event[] = []
  for (let level = pokemon.level + 1; level <= newLevel; level++) {
    events.push({ type: 'levelUp', tick, pokemonId: pokemon.id, level })
    const evo = nextEvolution(species, level, registry)
    if (evo) {
      events.push({ type: 'evolved', tick, pokemonId: pokemon.id, from: species.name, to: evo.name })
      species = evo
    }
  }
  const hpMax = hpAt(species.baseStats.hp, newLevel)
  return { pokemon: { ...pokemon, xp, level: newLevel, speciesName: species.name, hpMax, hp: pokemon.hp + (hpMax - pokemon.hpMax) }, events }
}

function addItems(inventory: Readonly<Record<string, number>>, drops: readonly { item: string; quantity: number }[]): Record<string, number> {
  return drops.reduce<Record<string, number>>((acc, d) => ({ ...acc, [d.item]: (acc[d.item] ?? 0) + d.quantity }), { ...inventory })
}

/**
 * Remove um selvagem do estado, agenda seu respawn e volta o jogador para `searching`.
 * Compartilhado entre `applyDefeat` (derrota) e `attemptCapture` (captura bem-sucedida) —
 * ambos os fluxos terminam o combate da mesma forma.
 */
export function removeWild(state: HuntState, deps: EngineDeps, wild: WildState): HuntState {
  const spawn = deps.hunt.spawns[wild.spawnIndex]
  if (!spawn) throw new Error(`spawn ${wild.spawnIndex} não existe`)
  return {
    ...state,
    wilds: state.wilds.filter((w) => w.id !== wild.id),
    respawns: [...state.respawns, { spawnIndex: wild.spawnIndex, atTick: state.tick + spawn.respawnSeconds * TICKS_PER_SECOND }],
    player: {
      ...state.player,
      mode: 'searching',
      targetWildId: null,
      path: [],
      skippedWildIds: state.player.skippedWildIds.filter((id) => id !== wild.id),
    },
  }
}

export function applyDefeat(state: HuntState, deps: EngineDeps, wild: WildState): StepResult {
  const species = speciesOf(deps.registry, wild.speciesName)
  const xp = xpOnDefeat(species, wild.level)
  const active = state.player.team[state.player.activeIndex]
  if (!active) throw new Error('sem Pokémon ativo')
  const gained = gainXp(active, xp, deps.registry, state.tick)
  // O degrau vem da área da região, não de um campo do mapa: é a região que define a escala de
  // dificuldade, e o mapa é só o recorte dela.
  const rarity = findArea(deps.registry.regions, deps.hunt.id)?.area.rarity ?? MIN_RARITY
  const loot = rollLoot(species, deps.registry.loot, deps.rng, rarity)
  const removed = removeWild(state, deps, wild)
  const team = removed.player.team.map((p, i) => (i === state.player.activeIndex ? gained.pokemon : p))
  const defeated: Event = {
    type: 'wildDefeated',
    tick: state.tick,
    wildId: wild.id,
    speciesName: wild.speciesName,
    level: wild.level,
    xpTrainer: xp,
    xpPokemon: xp,
    gold: loot.gold,
    drops: loot.drops,
  }
  return {
    state: {
      ...removed,
      trainer: { xp: state.trainer.xp + xp, gold: state.trainer.gold + loot.gold },
      inventory: addItems(state.inventory, loot.drops),
      player: { ...removed.player, team },
    },
    events: [defeated, ...gained.events],
  }
}
