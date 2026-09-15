import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

const base = { DATABASE_URL: 'postgres://u:p@localhost:5433/db' }

describe('loadConfig', () => {
  it('aplica os padrões', () => {
    expect(loadConfig(base)).toEqual({
      DATABASE_URL: base.DATABASE_URL, PORT: 3000, COOKIE_SECURE: false, APP_ORIGIN: 'http://localhost:3000',
      TRUST_PROXY: false, LOG_LEVEL: 'info', ARGON2_MEMORY_KIB: 65536, ARGON2_TIME_COST: 3,
      DEBUG_VIEWER: false, ASSETS_DIR: expect.stringMatching(/assets[/\\]atlas$/),
      CLIENT_DIST: expect.stringMatching(/client[/\\]dist$/),
    })
  })
  it('DEBUG_VIEWER, ASSETS_DIR e CLIENT_DIST aceitam override', () => {
    const c = loadConfig({ ...base, DEBUG_VIEWER: 'true', ASSETS_DIR: '/tmp/x', CLIENT_DIST: '/tmp/y' })
    expect(c).toMatchObject({ DEBUG_VIEWER: true, ASSETS_DIR: '/tmp/x', CLIENT_DIST: '/tmp/y' })
  })
  it('converte booleanos e números', () => {
    const c = loadConfig({ ...base, PORT: '8080', COOKIE_SECURE: 'true', TRUST_PROXY: 'true', ARGON2_MEMORY_KIB: '4096', ARGON2_TIME_COST: '1' })
    expect(c).toMatchObject({ PORT: 8080, COOKIE_SECURE: true, TRUST_PROXY: true, ARGON2_MEMORY_KIB: 4096, ARGON2_TIME_COST: 1 })
  })
  it('falha com mensagem clara sem DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/)
  })
  it('rejeita porta e origem inválidas', () => {
    expect(() => loadConfig({ ...base, PORT: '99999' })).toThrow(/PORT/)
    expect(() => loadConfig({ ...base, APP_ORIGIN: 'localhost' })).toThrow(/APP_ORIGIN/)
  })
  it('TRUST_PROXY aceita "false", "true", inteiro de hops ou lista de IPs/CIDRs; rejeita o resto', () => {
    expect(loadConfig(base).TRUST_PROXY).toBe(false)
    expect(loadConfig({ ...base, TRUST_PROXY: 'false' }).TRUST_PROXY).toBe(false)
    expect(loadConfig({ ...base, TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true)
    expect(loadConfig({ ...base, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2)
    expect(loadConfig({ ...base, TRUST_PROXY: '127.0.0.1,10.0.0.0/8' }).TRUST_PROXY).toBe('127.0.0.1,10.0.0.0/8')
    expect(() => loadConfig({ ...base, TRUST_PROXY: 'sim' })).toThrow(/TRUST_PROXY/)
  })
})
