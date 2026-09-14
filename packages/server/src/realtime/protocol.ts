import { z } from 'zod'
import { SettingsPatchSchema } from '../account/settings.js'
import type { Summary } from '../engine/simulate.js'
import type { Event, HuntState } from '../engine/types.js'
import { WS_MAX_MESSAGE_BYTES } from './constants.js'
import type { StopReason } from './runner.js'

export const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hunt.stop') }).strict(),
  z.object({ t: z.literal('item.use'), itemId: z.string().min(1).max(64) }).strict(),
  z.object({ t: z.literal('team.setActive'), pokemonId: z.string().min(1).max(128) }).strict(),
  z.object({ t: z.literal('settings.update'), patch: SettingsPatchSchema }).strict(),
  z.object({ t: z.literal('ping') }).strict(),
])
export type ClientMessage = z.infer<typeof ClientMessageSchema>

export interface SessionInfo { readonly huntId: string; readonly sessionId: string; readonly startedAt: string }

export type ServerMessage =
  | { readonly t: 'hunt.snapshot'; readonly session: SessionInfo; readonly state: HuntState }
  | { readonly t: 'hunt.tick'; readonly tick: number; readonly events: readonly Event[] }
  | { readonly t: 'hunt.stopped'; readonly reason: StopReason; readonly healed: boolean }
  | { readonly t: 'hunt.catchup'; readonly ticksRemaining: number }
  | { readonly t: 'hunt.summary'; readonly summary: Summary }
  | { readonly t: 'hunt.idle' }
  | { readonly t: 'error'; readonly code: string; readonly message: string }
  | { readonly t: 'pong' }

export type ParseResult = { readonly ok: true; readonly message: ClientMessage } | { readonly ok: false; readonly reason: string }

export function parseClientMessage(raw: string | Buffer, maxBytes: number = WS_MAX_MESSAGE_BYTES): ParseResult {
  const bytes = Buffer.isBuffer(raw) ? raw.length : Buffer.byteLength(raw, 'utf8')
  if (bytes > maxBytes) return { ok: false, reason: `mensagem com ${bytes} bytes; máximo ${maxBytes} bytes` }
  let json: unknown
  try { json = JSON.parse(raw.toString()) } catch { return { ok: false, reason: 'JSON inválido' } }
  const parsed = ClientMessageSchema.safeParse(json)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, reason: `${issue?.path.join('.') ?? ''}: ${issue?.message ?? 'mensagem inválida'}`.replace(/^: /, '') }
  }
  return { ok: true, message: parsed.data }
}
