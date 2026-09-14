import { describe, expect, it } from 'vitest'
import { checkOrigin, REDACT_PATHS } from '../src/http/security.js'

const req = (method: string, headers: Record<string, string>) => ({ method, headers }) as unknown as import('fastify').FastifyRequest
const APP = 'http://localhost:3000'

describe('checkOrigin', () => {
  it('GET/HEAD/OPTIONS passam sem Origin', () => {
    expect(checkOrigin(req('GET', {}), APP)).toBe(true)
    expect(checkOrigin(req('HEAD', {}), APP)).toBe(true)
  })
  it('POST exige Origin igual à origem do app', () => {
    expect(checkOrigin(req('POST', { origin: APP }), APP)).toBe(true)
    expect(checkOrigin(req('POST', { origin: 'http://evil.test' }), APP)).toBe(false)
    expect(checkOrigin(req('POST', {}), APP)).toBe(false)
  })
  it('aceita Referer da mesma origem quando não há Origin', () => {
    expect(checkOrigin(req('PUT', { referer: `${APP}/app` }), APP)).toBe(true)
    expect(checkOrigin(req('PUT', { referer: 'http://evil.test/x' }), APP)).toBe(false)
    expect(checkOrigin(req('PUT', { referer: 'lixo' }), APP)).toBe(false)
  })
})

describe('REDACT_PATHS', () => {
  it('cobre cookie, authorization, set-cookie, password e token', () => {
    expect(REDACT_PATHS).toEqual(['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', '*.password', '*.token'])
  })
})
