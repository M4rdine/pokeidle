/**
 * A régua do balanceamento: mede o que cada área rende de verdade, rodando o motor.
 *
 * Existe porque número de balanceamento não se estima — se estima errado. A primeira leitura
 * desta ferramenta mostrou que a ÚLTIMA área do jogo rendia sete vezes menos que uma vinte níveis
 * antes, e que duas áreas matavam um time do próprio nível delas. Nada disso aparecia lendo o
 * `regions.json`: são três números por área que se multiplicam com a matchup de tipo.
 *
 * Uso, na raiz:
 *   pnpm balanco            a curva das dezesseis áreas, com o degrau entre elas
 *   pnpm balanco --elenco   quanto cada espécie bate e quanto demora a morrer
 *
 * O time de referência é um trio de iniciais evoluídos no nível da área, um de cada tipo: o motor
 * só troca quando o ativo cai, então um time monotipo mede o azar do confronto em vez da área.
 */
import {
  availableMoves, bestMove, createRng, expectedDamage, hpAt, loadRegistry, statAt, xpForLevel,
  type Area, type TypeName,
} from '@pokeidle/shared'
import { basename } from 'node:path'
import { createHuntState, defaultSettings } from '../src/engine/create.js'
import { simulate, summarizeEvents } from '../src/engine/simulate.js'

const registry = loadRegistry()

/** Dez minutos a 200 ms. Longo o bastante para a média assentar, curto para rodar dezesseis vezes. */
const TICKS = 3000
const HORAS = TICKS / 5 / 3600
/** Três sementes: uma só mede a sorte daquela caçada, não a área. */
const SEEDS = [42, 9, 7] as const
const TIME = ['charizard', 'blastoise', 'venusaur'] as const

/**
 * O degrau que a curva deve ter entre uma área e a seguinte. Progredir precisa sempre compensar:
 * abaixo de 1,0 o jogo pune quem avança, e foi o que a medição encontrou em quatro áreas.
 */
export const DEGRAU_ALVO = 1.35

const membro = (nome: string, level: number, i: number) => {
  const hp = hpAt(registry.species.get(nome)!.baseStats.hp, level)
  return { id: `p${i}`, speciesName: nome, level, xp: xpForLevel('medium-slow', level), hp, hpMax: hp }
}

export interface Rendimento {
  readonly xpPorHora: number
  readonly ouroPorHora: number
  readonly derrotas: number
  readonly quedas: number
}

/**
 * A bolsa que a LOJA oferece a quem chega nesta área, e não a bolsa do jogador novato.
 *
 * Este detalhe dominava tudo. Medindo as áreas do fim com Poção comum — a bolsa de quem acabou de
 * começar —, `mata-fechada` rendia 922 mil XP/h; com Hiper Poção, que a loja libera no nível 30 e
 * portanto QUALQUER jogador ali já compra, ela rende 4,85 milhões. Cinco vezes. A primeira leitura
 * desta ferramenta acusou quatro áreas "quebradas" que na verdade estavam sendo medidas com
 * equipamento de vinte níveis atrás.
 *
 * A poção cura por PORCENTAGEM, então não é o valor que escala mal — é o número de turnos gastos
 * curando. Com 20% por poção e um selvagem que tira 35% por golpe, a cura não acompanha e a
 * caçada vira ida e volta ao Centro.
 */
function bolsaDe(area: Area): Record<string, number> {
  const itens = registry.unlocks.items
  const nivel = area.minTrainerLevel
  const pocao = nivel >= (itens['hyper-potion'] ?? Infinity) ? 'hyper-potion'
    : nivel >= (itens['super-potion'] ?? Infinity) ? 'super-potion'
      : 'potion'
  const bola = nivel >= (itens['ultra-ball'] ?? Infinity) ? 'ultra-ball'
    : nivel >= (itens['great-ball'] ?? Infinity) ? 'great-ball'
      : 'poke-ball'
  return { [pocao]: 99, [bola]: 20 }
}

/** Roda o motor nas três sementes e devolve a média. */
export function medirArea(area: Area, nivelDoTime = area.maxLevel): Rendimento {
  const hunt = registry.hunts.get(area.id)
  if (!hunt) throw new Error(`área ${area.id} não tem mapa em hunts/`)
  const inventory = bolsaDe(area)
  const corridas = SEEDS.map((seed) => {
    const deps = { registry, hunt, rng: createRng(seed) }
    const team = TIME.map((n, i) => membro(n, nivelDoTime, i))
    const s0 = createHuntState(
      { hunt, sessionId: 'balanco', team, inventory, settings: defaultSettings() },
      deps)
    return summarizeEvents(simulate(s0, TICKS, deps).events, TICKS)
  })
  const media = (f: (s: (typeof corridas)[number]) => number): number =>
    corridas.reduce((total, s) => total + f(s), 0) / corridas.length
  return {
    xpPorHora: media((s) => s.xpTrainer) / HORAS,
    ouroPorHora: media((s) => s.gold) / HORAS,
    derrotas: media((s) => s.defeats),
    quedas: media((s) => s.faints),
  }
}

/** As dezesseis áreas na ordem em que o jogo as abre. */
export const areasEmOrdem = (): readonly Area[] =>
  [...registry.regions.values()].sort((a, b) => a.order - b.order).flatMap((r) => r.areas)

// ── Perigo por espécie ───────────────────────────────────────────────────────

const combatente = (nome: string, level: number) => {
  const e = registry.species.get(nome)!
  return {
    level, types: e.types as readonly TypeName[], especie: e,
    stats: {
      hp: hpAt(e.baseStats.hp, level), attack: statAt(e.baseStats.attack, level),
      defense: statAt(e.baseStats.defense, level), spAttack: statAt(e.baseStats.spAttack, level),
      spDefense: statAt(e.baseStats.spDefense, level), speed: statAt(e.baseStats.speed, level),
    },
  }
}

const danoEntre = (a: ReturnType<typeof combatente>, b: ReturnType<typeof combatente>): number => {
  const m = bestMove(availableMoves(a.especie, a.level, registry.moves), a, b, registry.typeChart)
  return m === undefined ? 0 : expectedDamage(a, b, m, registry.typeChart)
}

export interface Perigo {
  readonly especie: string
  /** Quanto do HP do nosso MAIS FRÁGIL contra ela o selvagem tira num golpe, em porcentagem. */
  readonly porGolpe: number
  /** Golpes que o selvagem aguenta do nosso melhor atacante contra ele. */
  readonly turnosParaMorrer: number
}

/**
 * O pior caso, não a média: o motor só troca quando o ativo CAI, então quem decide se a área é
 * uma armadilha é o pior par possível — se o Charizard estiver em campo contra um Raichu, é esse
 * o número que vale, e não a média com o Venusaur que resiste.
 */
export function perigoDaArea(area: Area): readonly Perigo[] {
  return area.species.map((nome) => {
    const selvagem = combatente(nome, area.maxLevel)
    const nossos = TIME.map((n) => combatente(n, area.maxLevel))
    const nossoDanoMaximo = Math.max(...nossos.map((c) => danoEntre(c, selvagem)))
    const piorRazao = Math.max(...nossos.map((c) => danoEntre(selvagem, c) / c.stats.hp))
    return {
      especie: nome,
      porGolpe: piorRazao * 100,
      turnosParaMorrer: nossoDanoMaximo > 0 ? Math.ceil(selvagem.stats.hp / nossoDanoMaximo) : Infinity,
    }
  })
}

// ── Saída ────────────────────────────────────────────────────────────────────

const n = (x: number, casas = 0): string => x.toLocaleString('pt-BR', { maximumFractionDigits: casas })

function curva(): void {
  process.stdout.write(
    `${'área'.padEnd(22)} ${'nível'.padStart(7)} ${'XP/h'.padStart(10)} ${'degrau'.padStart(7)} ` +
    `${'ouro/h'.padStart(8)} ${'derrotas'.padStart(9)} ${'quedas'.padStart(7)}\n`)
  let anterior: number | null = null
  const problemas: string[] = []
  for (const area of areasEmOrdem()) {
    const m = medirArea(area)
    const degrau = anterior === null ? null : m.xpPorHora / anterior
    if (degrau !== null && degrau < 1) problemas.push(`${area.id}: rende ${(degrau * 100).toFixed(0)}% da anterior`)
    if (m.quedas > 0.5) problemas.push(`${area.id}: ${m.quedas.toFixed(1)} quedas com time do nível da área`)
    process.stdout.write(
      `${area.id.padEnd(22)} ${`${area.minLevel}-${area.maxLevel}`.padStart(7)} ${n(m.xpPorHora).padStart(10)} ` +
      `${(degrau === null ? '—' : `${degrau.toFixed(2)}×`).padStart(7)} ${n(m.ouroPorHora).padStart(8)} ` +
      `${n(m.derrotas).padStart(9)} ${m.quedas.toFixed(1).padStart(7)}\n`)
    anterior = m.xpPorHora
  }
  process.stdout.write(problemas.length === 0
    ? '\nA curva sobe em todas as dezesseis, e nenhuma área derruba um time do nível dela.\n'
    : `\n${problemas.length} problema(s):\n${problemas.map((p) => `  - ${p}`).join('\n')}\n`)
}

function elenco(): void {
  process.stdout.write(`${'área'.padEnd(22)} ${'espécie'.padEnd(14)} ${'%HP/golpe'.padStart(10)} ${'turnos p/ morrer'.padStart(17)}\n`)
  for (const area of areasEmOrdem()) {
    for (const p of perigoDaArea(area)) {
      // Acima de 45% o selvagem derruba em três golpes, e o motor gasta a caçada voltando ao
      // Centro. Quatro turnos ou mais para morrer é esponja: a área trava mesmo sem matar ninguém.
      const marca = p.porGolpe > 45 ? '  ← derruba rápido' : p.turnosParaMorrer >= 4 ? '  ← esponja' : ''
      process.stdout.write(
        `${area.id.padEnd(22)} ${p.especie.padEnd(14)} ${`${p.porGolpe.toFixed(0)}%`.padStart(10)} ` +
        `${String(p.turnosParaMorrer).padStart(17)}${marca}\n`)
    }
  }
}

/*
 * Só roda quando ESTE arquivo é o que foi chamado. Sem a guarda, importar `medirArea` daqui —
 * que é justamente o motivo de as funções serem exportadas — dispara a curva inteira antes de o
 * importador rodar a primeira linha, e a saída dele sai embaixo de dezesseis áreas de tabela.
 */
const chamadoDireto = process.argv[1] !== undefined && import.meta.url.endsWith(basename(process.argv[1]))
if (chamadoDireto) {
  if (process.argv.includes('--elenco')) elenco()
  else curva()
}
