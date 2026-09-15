import { ClientMessageSchema, type ClientMessage } from '@pokeidle/shared/protocol'
import { WS_MAX_MESSAGE_BYTES } from './constants.js'

export { ClientMessageSchema, type ClientMessage, type ServerMessage, type SessionInfo } from '@pokeidle/shared/protocol'

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
