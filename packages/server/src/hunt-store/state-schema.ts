import { HuntStateSchema } from '@pokeidle/shared/protocol'
import type { z } from 'zod'
import type { HuntState } from '../engine/types.js'
import { AppError } from '../http/errors.js'

export { HuntStateSchema } from '@pokeidle/shared/protocol'

/**
 * Snapshot em `hunt_sessions.state` que não bate mais com `HuntStateSchema` (corrupção,
 * migração incompleta etc.). `code: 'internal'` vira 500 genérico na resposta (S13); `issues`
 * (caminho + mensagem de cada problema do Zod) só existe para o log, nunca para o cliente.
 */
export class CorruptSnapshotError extends AppError {
  readonly issues: readonly string[]
  constructor(zodError: z.ZodError) {
    super('internal', 'snapshot da hunt inválido')
    this.name = 'CorruptSnapshotError'
    this.issues = zodError.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
  }
}

export function parseHuntState(json: unknown): HuntState {
  const result = HuntStateSchema.safeParse(json)
  if (!result.success) throw new CorruptSnapshotError(result.error)
  return result.data as HuntState
}
