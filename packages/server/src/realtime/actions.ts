import type { Registry } from '@pokeidle/shared'
import { updateSettings, type SettingsPatch } from '../account/settings.js'
import type { Db } from '../db/client.js'
import type { TrainerRow } from '../db/schema.js'
import type { HuntState, Intent, IntentResult } from '../engine/types.js'
import { loadActive } from '../hunt-store/snapshot.js'
import { startHunt } from '../hunt-store/start.js'
import { stopHunt } from '../hunt-store/stop.js'
import type { RouteDeps } from '../http/routes/auth.js'
import type { Scheduler } from './scheduler.js'
import type { SocketRegistry } from './sockets.js'

export interface RealtimeDeps { readonly db: Db; readonly registry: Registry; readonly now: () => Date; readonly scheduler: Scheduler; readonly sockets: SocketRegistry }
export interface SessionView { readonly huntId: string; readonly sessionId: string; readonly startedAt: Date; readonly state: HuntState }

/** Cada rota HTTP tinha sua própria cópia de `rt = (d: RouteDeps): RealtimeDeps => ({...})`
 * (hunts.ts, trainer.ts); centraliza aqui. `import type` não gera dependência em tempo de
 * execução — só de tipos — então não fecha um ciclo real com `http/app.ts` (que importa
 * `wsRoutes`, que importa este módulo). */
export function toRealtimeDeps(deps: RouteDeps): RealtimeDeps {
  return { db: deps.db, registry: deps.registry, now: deps.now, scheduler: deps.realtime.scheduler, sockets: deps.realtime.sockets }
}

type UpdateSettingsPatch = Extract<Intent, { type: 'updateSettings' }>['patch']

/**
 * `SettingsPatch` (Zod) tipa campos opcionais como `T | undefined`; o `Intent` do motor usa
 * `Partial<...>` puro. Sob `exactOptionalPropertyTypes` os dois não são intercambiáveis — este
 * adaptador só copia as chaves de fato presentes no patch.
 */
function toIntentPatch(patch: SettingsPatch): UpdateSettingsPatch {
  return {
    ...(patch.returnHpPercent !== undefined && { returnHpPercent: patch.returnHpPercent }),
    ...(patch.potionHpPercent !== undefined && { potionHpPercent: patch.potionHpPercent }),
    ...(patch.capture !== undefined && {
      capture: {
        ...(patch.capture.ballTier !== undefined && { ballTier: patch.capture.ballTier }),
        ...(patch.capture.maxWildHpPercent !== undefined && { maxWildHpPercent: patch.capture.maxWildHpPercent }),
        ...(patch.capture.allowDuplicates !== undefined && { allowDuplicates: patch.capture.allowDuplicates }),
      },
    }),
  }
}

export async function startAndAttach(d: RealtimeDeps, trainerId: string, huntId: string): Promise<{ huntId: string; sessionId: string; startedAt: Date }> {
  const row = await startHunt(d.db, d.registry, trainerId, huntId, d.now())
  d.scheduler.noteHuntStarted()
  await d.scheduler.attach(trainerId)
  return { huntId: row.huntId, sessionId: row.sessionId, startedAt: row.startedAt }
}

export async function stopViaScheduler(d: RealtimeDeps, trainerId: string): Promise<TrainerRow> {
  const finished = await d.scheduler.finish(trainerId, 'intent')
  return finished ?? stopHunt(d.db, trainerId, d.now())
}

export async function applySettings(d: RealtimeDeps, trainerId: string, patch: SettingsPatch): Promise<TrainerRow> {
  const row = await updateSettings(d.db, trainerId, patch, d.now())
  // O banco (`updateSettings` acima) sempre grava o valor novo, mesmo se o runner estiver em
  // catch-up: `applyIntent` devolve `error: 'catching-up'` nesse caso (de propósito descartado
  // aqui — nada a fazer com ele) e a hunt em memória segue com as configurações antigas até o
  // catch-up terminar (próximo snapshot/attach já nasce com o valor novo do banco).
  if (d.scheduler.get(trainerId)) d.scheduler.applyIntent(trainerId, { type: 'updateSettings', patch: toIntentPatch(patch) })
  return row
}

export const useItem = (d: RealtimeDeps, trainerId: string, itemId: string): IntentResult => d.scheduler.applyIntent(trainerId, { type: 'useItem', itemId })
export const setActive = (d: RealtimeDeps, trainerId: string, pokemonId: string): IntentResult => d.scheduler.applyIntent(trainerId, { type: 'setActive', pokemonId })

/** S25: monta campo a campo; nunca devolve seed/rngState. */
export async function activeView(d: RealtimeDeps, trainerId: string): Promise<SessionView | null> {
  const runner = d.scheduler.get(trainerId)
  if (runner) return { huntId: runner.huntId, sessionId: runner.sessionId, startedAt: runner.startedAt, state: runner.state }
  const active = await loadActive(d.db, trainerId)
  return active ? { huntId: active.huntId, sessionId: active.sessionId, startedAt: active.startedAt, state: active.state } : null
}
