import { Writable } from 'node:stream'
import pino from 'pino'
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
  it('um pino real com redact: REDACT_PATHS apaga cookie, authorization, password e token da linha logada (S14)', () => {
    let logged = ''
    const stream = new Writable({
      write(chunk: Buffer, _enc, cb) {
        logged += chunk.toString()
        cb()
      },
    })
    const logger = pino({ redact: [...REDACT_PATHS] }, stream)
    logger.info({ req: { headers: { cookie: 'sid=abc', authorization: 'Bearer x' } }, password: 'p', token: 't' }, 'linha de teste')

    expect(logged).not.toContain('sid=abc')
    expect(logged).not.toContain('Bearer x')
    expect(logged).not.toContain('"password":"p"')
    expect(logged).not.toContain('"token":"t"')
    expect(logged).toContain('[Redacted]')
  })
})
