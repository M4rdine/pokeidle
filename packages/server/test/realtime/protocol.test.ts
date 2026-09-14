import { describe, expect, it } from 'vitest'
import { WS_MAX_MESSAGE_BYTES } from '../../src/realtime/constants.js'
import { parseClientMessage } from '../../src/realtime/protocol.js'

describe('parseClientMessage', () => {
  it('aceita cada mensagem válida', () => {
    for (const raw of ['{"t":"hunt.stop"}', '{"t":"item.use","itemId":"potion"}', '{"t":"team.setActive","pokemonId":"st-1"}', '{"t":"settings.update","patch":{"returnHpPercent":40,"capture":{"ballTier":"great"}}}', '{"t":"ping"}']) {
      const r = parseClientMessage(raw)
      expect(r.ok, raw).toBe(true)
    }
    const r = parseClientMessage('{"t":"item.use","itemId":"potion"}')
    if (r.ok) expect(r.message).toEqual({ t: 'item.use', itemId: 'potion' })
  })
  it('rejeita JSON inválido, tipo desconhecido, campo extra, campo faltando e settings fora da faixa', () => {
    for (const raw of ['{', '{"t":"hack"}', '{"t":"ping","x":1}', '{"t":"item.use"}', '{"t":"settings.update","patch":{"returnHpPercent":101}}', '[]', '"ping"']) {
      const r = parseClientMessage(raw)
      expect(r.ok, raw).toBe(false)
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(0)
    }
  })
  it('rejeita mensagem acima do limite de bytes (medindo bytes, não chars)', () => {
    const big = JSON.stringify({ t: 'item.use', itemId: 'a'.repeat(WS_MAX_MESSAGE_BYTES) })
    expect(parseClientMessage(big)).toMatchObject({ ok: false, reason: expect.stringMatching(/bytes/) })
    const multibyte = JSON.stringify({ t: 'item.use', itemId: 'é'.repeat(30) })
    expect(parseClientMessage(multibyte, 60)).toMatchObject({ ok: false })
    expect(parseClientMessage(Buffer.from('{"t":"ping"}'))).toMatchObject({ ok: true })
  })
})
