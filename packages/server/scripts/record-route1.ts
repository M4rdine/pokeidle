/**
 * Script manual (não testado por vitest): roda o motor real por 300 ticks na Rota 1 com
 * seed fixa e grava `hunt.snapshot` inicial + `hunt.tick`s com eventos + estado final em
 * `packages/client/test/fixtures/route1-300.json`. Usado como fixture de replay pelo
 * espelho puro do cliente (`state/hunt-view.ts`): o teste reaplica cada `hunt.tick` sobre
 * o snapshot e compara o resultado com `final`.
 *
 * Uso: `pnpm --filter @pokeidle/server record:route1`. O JSON gerado é commitado — rode de
 * novo e recommite só se o motor ou a fixture mudarem de propósito.
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRng, hpAt, loadRegistry, TICK_MS, xpForLevel } from '@pokeidle/shared'
import type { ServerMessage } from '@pokeidle/shared/protocol'
import { createHuntState, defaultSettings } from '../src/engine/create.js'
import { step } from '../src/engine/step.js'

type HuntSnapshotMsg = Extract<ServerMessage, { t: 'hunt.snapshot' }>
type HuntTickMsg = Extract<ServerMessage, { t: 'hunt.tick' }>

const registry = loadRegistry()
const hunt = registry.hunts.get('route-1')!
const base = registry.species.get('charmander')!.baseStats.hp
const team = [{ id: 'p1', speciesName: 'charmander', level: 10, xp: xpForLevel('medium-slow', 10), hp: hpAt(base, 10), hpMax: hpAt(base, 10) }]
const deps = { registry, hunt, rng: createRng(42) }
const T0 = Date.UTC(2026, 8, 14, 12, 0, 0)
let state = createHuntState({ hunt, sessionId: 'rec', team, inventory: { potion: 3, 'poke-ball': 5 }, settings: defaultSettings() }, deps)
const session = { huntId: 'route-1', sessionId: 'rec', startedAt: new Date(T0).toISOString() }
const snapshot: HuntSnapshotMsg = { t: 'hunt.snapshot', session, state, serverTime: T0 }
const ticks: HuntTickMsg[] = []
for (let i = 0; i < 300; i++) {
  const r = step(state, deps)
  state = r.state
  if (r.events.length > 0) ticks.push({ t: 'hunt.tick', tick: state.tick, events: r.events, serverTime: T0 + state.tick * TICK_MS })
}
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/test/fixtures/route1-300.json')
await writeFile(out, JSON.stringify({ snapshot, ticks, final: state }, null, 1))
process.stdout.write(`${out}: ${ticks.length} ticks com eventos, tick final ${state.tick}\n`)
