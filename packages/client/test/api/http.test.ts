import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiError, createHttp } from '../../src/api/http.js'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('http', () => {
  it('GET valida a resposta com o schema e manda credenciais same-origin', async () => {
    const fetchMock = vi.fn(async () => json(200, { ok: true }))
    const http = createHttp({ fetch: fetchMock, onUnauthorized: () => {} })
    await expect(http.get('/me', z.object({ ok: z.boolean() }))).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/me', expect.objectContaining({ method: 'GET', credentials: 'same-origin' }))
  })
  it('POST manda JSON; erro do servidor vira ApiError com code e status; 401 chama onUnauthorized', async () => {
    const onUnauthorized = vi.fn()
    const http = createHttp({ fetch: vi.fn(async () => json(409, { error: { code: 'hunt-active', message: 'pare a hunt' } })), onUnauthorized })
    const err = await http.post('/shop/buy', { itemId: 'potion', quantity: 1 }, z.unknown()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ code: 'hunt-active', status: 409, message: 'pare a hunt' })
    const http401 = createHttp({ fetch: vi.fn(async () => json(401, { error: { code: 'unauthorized', message: 'x' } })), onUnauthorized })
    await expect(http401.get('/me', z.unknown())).rejects.toMatchObject({ code: 'unauthorized' })
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })
  it('resposta fora do schema vira ApiError bad-response; falha de rede vira ApiError network', async () => {
    const http = createHttp({ fetch: vi.fn(async () => json(200, { nope: 1 })), onUnauthorized: () => {} })
    await expect(http.get('/me', z.object({ ok: z.boolean() }))).rejects.toMatchObject({ code: 'bad-response' })
    const down = createHttp({ fetch: vi.fn(async () => { throw new TypeError('failed') }), onUnauthorized: () => {} })
    await expect(down.get('/me', z.unknown())).rejects.toMatchObject({ code: 'network' })
  })
})
