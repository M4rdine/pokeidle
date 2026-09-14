import { describe, expect, it } from 'vitest'
import { dummyHashFor, hashPassword, verifyPassword } from '../src/auth/password.js'

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
  it('dummyHashFor gera hash com o custo pedido, nunca verifica, e é memoizado por opções (S7)', async () => {
    const h1 = await dummyHashFor(fast)
    expect(h1.startsWith('$argon2id$')).toBe(true)
    // Encoded params order is m,p,t (argon2's own encoding) — assert both requested costs are present.
    expect(h1).toContain('m=4096')
    expect(h1).toContain('t=1')
    expect(await verifyPassword(h1, '')).toBe(false)

    const h2 = await dummyHashFor(fast)
    expect(h2).toBe(h1)

    const h3 = await dummyHashFor({ memoryCost: 8192, timeCost: 2 })
    expect(h3).not.toBe(h1)
    expect(h3).toContain('m=8192')
    expect(h3).toContain('t=2')
  })
})
