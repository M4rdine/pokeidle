import { describe, expect, it } from 'vitest'
import { DUMMY_HASH, hashPassword, verifyPassword } from '../src/auth/password.js'

const fast = { memoryCost: 4096, timeCost: 1 }

describe('password', () => {
  it('hash argon2id verifica a senha certa e recusa a errada', async () => {
    const h = await hashPassword('segredo123', fast)
    expect(h.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword(h, 'segredo123')).toBe(true)
    expect(await verifyPassword(h, 'segredo124')).toBe(false)
  })
  it('hash inválido devolve false em vez de lançar', async () => {
    expect(await verifyPassword('lixo', 'x')).toBe(false)
  })
  it('DUMMY_HASH nunca verifica', async () => {
    expect(DUMMY_HASH.startsWith('$argon2id$')).toBe(true)
    expect(await verifyPassword(DUMMY_HASH, '')).toBe(false)
  })
})
