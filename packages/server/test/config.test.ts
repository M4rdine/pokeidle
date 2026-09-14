import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.js'

const base = { DATABASE_URL: 'postgres://u:p@localhost:5433/db' }

describe('loadConfig', () => {
  it('aplica os padrões', () => {
    expect(loadConfig(base)).toEqual({
      DATABASE_URL: base.DATABASE_URL, PORT: 3000, COOKIE_SECURE: false, APP_ORIGIN: 'http://localhost:3000',
      TRUST_PROXY: false, LOG_LEVEL: 'info', ARGON2_MEMORY_KIB: 65536, ARGON2_TIME_COST: 3,
    })
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
})
